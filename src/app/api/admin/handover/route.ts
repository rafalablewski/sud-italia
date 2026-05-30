import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { appendAuditLog, getShiftHandovers, saveShiftHandover } from "@/lib/store";
import { handoverCreateSchema, parseBody } from "@/lib/api-schemas";

// Shift handover (audit §11.2 / §12.4 #1). Closing/opening a shift is a
// manager responsibility — manager+.

export const GET = withAdmin(
  { locationParam: "location", roles: ["manager", "owner"] },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }
    const from = req.nextUrl.searchParams.get("from") || undefined;
    return NextResponse.json(await getShiftHandovers(locationSlug, { fromIso: from }));
  },
);

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, handoverCreateSchema);
    if ("error" in parsed) return parsed.error;
    const { locationSlug, recordedBy, ...rest } = parsed.data;

    if (!(await hasLocationAccess(locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${locationSlug}"` },
        { status: 403 },
      );
    }

    const actor = recordedBy?.trim() || user.email || user.id;
    const entry = await saveShiftHandover({ locationSlug, recordedBy: actor, ...rest });

    await appendAuditLog({
      actor,
      action: "shift.handover",
      entityType: "shift_handover",
      entityId: entry.id,
      after: {
        shift: entry.shift,
        cashVarianceGrosze: entry.cashVarianceGrosze ?? null,
        tempChecksOk: entry.tempChecksOk,
        wasteNoted: entry.wasteNoted,
        equipmentOk: entry.equipmentOk,
        outgoingManager: entry.outgoingManager,
        locationSlug,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  },
);
