import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor, requireRole } from "@/lib/admin-auth";
import { appendAuditLog } from "@/lib/store";
import { deleteCustomerData } from "@/lib/gdpr";

/**
 * GDPR Article 17 erasure endpoint. Redacts identity fields from every
 * record tied to the phone. The actor must POST a body containing
 * `{ phone, confirm: true }` — the explicit confirm flag prevents
 * accidental erasure if the endpoint is hit by a misconfigured tool.
 */
export async function POST(req: NextRequest) {
  // Erasure is destructive and irreversible — owner only.
  const auth = await requireRole(["owner"]);
  if ("error" in auth) return auth.error;

  let body: { phone?: string; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.phone) {
    return NextResponse.json({ error: "phone required" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Must include `confirm: true` to execute erasure" },
      { status: 400 },
    );
  }

  const result = await deleteCustomerData(body.phone);

  const actor = await getCurrentActor();
  await appendAuditLog({
    actor,
    action: "gdpr.delete",
    entityType: "customer",
    entityId: result.phone,
    before: { phone: result.phone },
    after: {
      tombstone: result.tombstone,
      redactedOrders: result.redactedOrders,
      removedNotes: result.removedNotes,
      removedLoyaltyMember: result.removedLoyaltyMember,
      redactedFeedback: result.redactedFeedback,
    },
  });

  return NextResponse.json(result);
}
