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
  needs: z.array(z.enum(["accessible", "high-chair", "step-free"])).max(3).optional(),
  joinedTableIds: z.array(z.string().min(1)).max(4).optional(),
  override: z.boolean().optional(),
});

// 409 for the conflict gates the operator can override; 400 for hard invalids.
const CONFLICT_REASONS = new Set(["table_conflict", "slot_full"]);

// Machine reason → operator-facing message (the toast text on a failed book).
const REASON_MESSAGES: Record<string, string> = {
  slot_inactive: "That time slot isn't open for booking.",
  slot_not_dinein: "That slot doesn't take dine-in reservations.",
  before_open: "The restaurant isn't open yet at that time.",
  after_last_seating: "Too late to seat — that's past the last seating (30 min before close).",
  invalid_party: "Enter a valid party size.",
  table_too_small: "That table is too small for the party.",
  table_conflict: "That table is already booked at that time.",
  slot_full: "Every table is taken at that time.",
  slot_not_found: "That time slot no longer exists.",
  table_not_found: "That table no longer exists.",
};

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
      return NextResponse.json(
        { error: result.reason, message: REASON_MESSAGES[result.reason] ?? "Could not book.", conflicts: result.conflicts },
        { status },
      );
    }
    return NextResponse.json({ ok: true, reservation: result.reservation });
  },
);
