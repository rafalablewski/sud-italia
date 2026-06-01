import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getDemandSignals,
  getOrders,
  getSlots,
  updateSlot,
} from "@/lib/store";
import { buildDemandBoard, demonstratedCoversPerHour, type DemandBoard } from "@/lib/demand-exchange";

/**
 * Demand Exchange — the per-slot demand board (Module 2; see
 * docs/strategy/restaurant-os-blueprint.md §3). Forecasts covers per slot from
 * real same-weekday history, compares against the demonstrated kitchen ceiling,
 * folds in logged rejected-demand, and prescribes the yield action. All derived
 * from live data; no mock demand.
 *
 * GET  /api/admin/demand-exchange?location=&date=  → the board. (manager+)
 * POST → the act (Phase 2): apply the demand-matched capacity to a slot.
 *          { slotId, maxOrders }   — resize one slot.
 *          { mode: "apply-all" }   — the autonomy lever: re-derive the board
 *                                    server-side and resize every slot whose
 *                                    recommended capacity differs from current.
 */

async function loadBoard(locationSlug: string, date: string): Promise<DemandBoard> {
  const [slots, allOrders, signals] = await Promise.all([
    getSlots(locationSlug, date),
    getOrders(),
    getDemandSignals(locationSlug, date),
  ]);
  const locOrders = allOrders.filter((o) => o.locationSlug === locationSlug);

  // Demonstrated kitchen ceiling: realized covers/hour over the last 90 days.
  const cutoff = Date.now() - 90 * 86_400_000;
  const instants = locOrders
    .filter((o) => o.status !== "pending" && o.status !== "cancelled" && !o.simulated)
    .map((o) => new Date(o.paidAt ?? o.createdAt).getTime())
    .filter((ms) => ms >= cutoff);
  const kitchenCoversPerHour = demonstratedCoversPerHour(instants);

  return buildDemandBoard({
    date,
    slots: slots.map((s) => ({
      id: s.id,
      date: s.date,
      time: s.time,
      maxOrders: s.maxOrders,
      currentOrders: s.currentOrders,
      fulfillmentTypes: s.fulfillmentTypes,
      status: s.status,
      minSpendGrosze: s.minSpendGrosze,
    })),
    orders: locOrders.map((o) => ({
      slotDate: o.slotDate,
      slotTime: o.slotTime,
      status: o.status,
      simulated: o.simulated,
      totalAmount: o.totalAmount,
    })),
    signals: signals.map((s) => ({ date: s.date, time: s.time })),
    kitchenCoversPerHour,
  });
}

function dateParam(req: Request): string {
  return new URL(req.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
}

export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location is required" }, { status: 400 });
    const board = await loadBoard(locationSlug, dateParam(req));
    return NextResponse.json({ board });
  },
);

const ApplySchema = z.object({
  slotId: z.string().min(1),
  maxOrders: z.number().int().min(1).max(1000),
  minSpendGrosze: z.number().int().min(0).max(1_000_000).optional(),
});

export const POST = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug, user }) => {
    if (!locationSlug) return NextResponse.json({ error: "location is required" }, { status: 400 });
    const actor = user.email || user.id;
    const body = await req.json().catch(() => null);

    // Apply-all — the autonomy lever. Re-derive the board server-side so the
    // capacities applied are the system's, never client-supplied.
    if (body && typeof body === "object" && (body as { mode?: string }).mode === "apply-all") {
      const board = await loadBoard(locationSlug, dateParam(req));
      let applied = 0;
      for (const r of board.slots) {
        const changed =
          r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze;
        if (!changed) continue;
        const updated = await updateSlot(r.slotId, {
          maxOrders: r.recommendedMaxOrders,
          minSpendGrosze: r.recommendedMinSpendGrosze || undefined,
        });
        if (updated) {
          applied += 1;
          await appendAuditLog({
            actor,
            action: "slots.resize",
            entityType: "slot",
            entityId: r.slotId,
            before: { maxOrders: r.maxOrders, minSpendGrosze: r.minSpendGrosze },
            after: {
              maxOrders: r.recommendedMaxOrders,
              minSpendGrosze: r.recommendedMinSpendGrosze,
              source: "demand-exchange.apply-all",
            },
          });
        }
      }
      return NextResponse.json({ ok: true, applied });
    }

    const parsed = ApplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
    }
    const updated = await updateSlot(parsed.data.slotId, {
      maxOrders: parsed.data.maxOrders,
      minSpendGrosze: parsed.data.minSpendGrosze || undefined,
    });
    if (!updated) return NextResponse.json({ error: "slot not found" }, { status: 404 });

    await appendAuditLog({
      actor,
      action: "slots.resize",
      entityType: "slot",
      entityId: parsed.data.slotId,
      after: {
        maxOrders: parsed.data.maxOrders,
        minSpendGrosze: parsed.data.minSpendGrosze ?? 0,
        source: "demand-exchange",
      },
    });
    return NextResponse.json({ ok: true, slot: updated });
  },
);
