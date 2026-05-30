import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { appendAuditLog, getWasteLogs, saveWasteLog } from "@/lib/store";
import { parseBody, wasteLogCreateSchema } from "@/lib/api-schemas";

// Waste log (audit §11.2 / §12.4 #4). Logging waste is a line task — staff+.

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }
    const from = req.nextUrl.searchParams.get("from") || undefined;
    return NextResponse.json(await getWasteLogs(locationSlug, { fromIso: from }));
  },
);

export const POST = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, wasteLogCreateSchema);
  if ("error" in parsed) return parsed.error;
  const { locationSlug, recordedBy, ...rest } = parsed.data;

  if (!(await hasLocationAccess(locationSlug))) {
    return NextResponse.json(
      { error: `Session is not authorized for location "${locationSlug}"` },
      { status: 403 },
    );
  }

  const actor = recordedBy?.trim() || user.email || user.id;
  const entry = await saveWasteLog({ locationSlug, recordedBy: actor, ...rest });

  await appendAuditLog({
    actor,
    action: "waste.log",
    entityType: "waste_log",
    entityId: entry.id,
    after: {
      item: entry.item,
      quantity: entry.quantity,
      unit: entry.unit,
      reason: entry.reason,
      estimatedCostGrosze: entry.estimatedCostGrosze ?? null,
      locationSlug,
    },
  });

  return NextResponse.json(entry, { status: 201 });
});
