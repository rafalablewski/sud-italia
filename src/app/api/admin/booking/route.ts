import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import { createBooking } from "@/lib/booking";

/**
 * Unified booking — book a dine-in time slot + assign a table in one call
 * (the merged Floor + Slots flow). Conflict-checked on both the slot's booking
 * capacity and table double-booking; `override` forces past both. Manager+.
 *
 * POST /api/admin/booking?location=
 *   { slotId, tableId, customerName, customerPhone?, partySize, durationMin?, notes?, override? }
 */
const BookingSchema = z.object({
  slotId: z.string().min(1),
  tableId: z.string().min(1),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional(),
  partySize: z.number().int().min(1).max(50),
  durationMin: z.number().int().min(15).max(600).optional(),
  notes: z.string().max(500).optional(),
  override: z.boolean().optional(),
});

// 409 for the conflict gates the operator can override; 400 for hard invalids.
const CONFLICT_REASONS = new Set(["table_conflict", "slot_full"]);

export const POST = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location is required" }, { status: 400 });
    const parsed = BookingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await createBooking({ locationSlug, ...parsed.data });
    if (!result.ok) {
      const status = CONFLICT_REASONS.has(result.reason) ? 409 : 400;
      return NextResponse.json({ error: result.reason, conflicts: result.conflicts }, { status });
    }
    return NextResponse.json({ ok: true, reservation: result.reservation });
  },
);
