import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getTimePunches, recordTimePunch } from "@/lib/store";

export const GET = withAdmin({}, async (req) => {
  const staffId = req.nextUrl.searchParams.get("staffId") || undefined;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  return NextResponse.json(await getTimePunches({ staffId, from, to }));
});

// Time punches are written by staff themselves at the start/end of a shift —
// staff+ role gate. Indirect tenancy via staffId; tightening to per-location
// requires Phase 1 normalized staff table.
export const POST = withAdmin(
  { roles: ["staff", "manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.staffId || !["clock-in", "clock-out"].includes(body.type)) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }
      const punch = await recordTimePunch({
        staffId: body.staffId,
        type: body.type,
        shiftId: body.shiftId,
        occurredAt: body.occurredAt,
      });
      return NextResponse.json(punch, { status: 201 });
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  },
);
