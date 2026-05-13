import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getCurrentActor } from "@/lib/admin-auth";
import { appendAuditLog } from "@/lib/store";
import { deleteCustomerData } from "@/lib/gdpr";
import { gdprDeleteSchema, parseBody } from "@/lib/api-schemas";

/**
 * GDPR Article 17 erasure endpoint. Redacts identity fields from every
 * record tied to the phone. The actor must POST a body containing
 * `{ phone, confirm: true }` — the explicit confirm flag prevents
 * accidental erasure if the endpoint is hit by a misconfigured tool.
 *
 * Erasure is destructive and irreversible — owner only.
 */
export const POST = withAdmin(
  { roles: ["owner"] },
  async (req) => {
    const parsed = await parseBody(req, gdprDeleteSchema);
    if ("error" in parsed) return parsed.error;
    const { phone } = parsed.data;

    const result = await deleteCustomerData(phone);

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
  },
);
