import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import { getFloorEvents, getOrders, getTables, saveTable, updateOrder } from "@/lib/store";
import { buildFloorTwin } from "@/lib/floor-twin";
import { analyzeTruck } from "@/lib/kds-prediction";
import { MENU_CATEGORY_LABELS } from "@/data/types";

/**
 * Floor Twin — the live economic simulation of the room (Module 3 keystone;
 * see docs/strategy/restaurant-os-blueprint.md §4). Realized turn-time + spend
 * velocity per table, live occupancy, and predicted free-in — all derived from
 * real dine-in orders + the current table list. Staff+ (seating is a
 * service-floor decision).
 *
 * GET /api/admin/floor-twin?location=
 */
export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location is required" }, { status: 400 });

    // Measured-dwell instrumentation: 30 days of status transitions. The same
    // window scopes the order read — pushing the location + since filters into
    // the query (PG indexes / a single-location slice) instead of pulling every
    // order across all trucks for all time and filtering in memory.
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [tables, orders, events] = await Promise.all([
      getTables(locationSlug),
      getOrders(locationSlug, since),
      getFloorEvents(locationSlug, since),
    ]);

    const twin = buildFloorTwin({
      transitions: events.map((e) => ({ tableId: e.tableId, from: e.from, to: e.to, at: e.at })),
      tables: tables.map((t) => ({
        id: t.id,
        number: t.number,
        seats: t.seats,
        zone: t.zone,
        status: t.status,
        notes: t.notes,
        features: t.features,
      })),
      orders: orders.map((o) => ({
        tableId: o.tableId,
        partySize: o.partySize,
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        fulfillmentType: o.fulfillmentType,
        simulated: o.simulated,
      })),
    });

    // Bottleneck pre-emption — fuse the live KDS pace engine onto the floor so
    // the host knows when to slow seating. analyzeTruck filters to active
    // orders + reads the real per-station load.
    const bn = analyzeTruck(orders, Date.now()).bottleneck;
    const kitchen =
      bn && bn.tier !== "calm"
        ? { tier: bn.tier, station: bn.id as string, label: MENU_CATEGORY_LABELS[bn.id] ?? bn.id, util: Math.round(bn.util * 100) }
        : { tier: "calm" as const, station: null, label: null, util: bn ? Math.round(bn.util * 100) : 0 };

    return NextResponse.json({ twin, kitchen });
  },
);

const ActionSchema = z.object({
  action: z.enum(["seat", "clear", "move"]),
  tableId: z.string().min(1),
  /** Destination table for a move (the party + its open check go here). */
  toTableId: z.string().min(1).optional(),
});

/**
 * Seat / clear a table from the Twin — the predictive-seating act. Flips the
 * table status, which `saveTable` logs as a transition (feeding the measured
 * dwell loop). Staff+ (a service-floor decision).
 */
export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location is required" }, { status: 400 });
    const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
    }
    const tables = await getTables(locationSlug);
    const table = tables.find((t) => t.id === parsed.data.tableId);
    if (!table) return NextResponse.json({ error: "table not found" }, { status: 404 });

    // Move — relocate a seated party (and its open dine-in check) to another
    // table: reassign the source table's active orders, free the source, seat
    // the target. The check follows the party; the Twin re-derives dwell.
    if (parsed.data.action === "move") {
      const target = parsed.data.toTableId ? tables.find((t) => t.id === parsed.data.toTableId) : undefined;
      if (!target) return NextResponse.json({ error: "target table not found" }, { status: 404 });
      if (target.id === table.id) return NextResponse.json({ error: "same table" }, { status: 400 });
      if (target.status === "out-of-service") return NextResponse.json({ error: "target out of service" }, { status: 400 });
      const orders = await getOrders(locationSlug);
      const moving = orders.filter((o) => o.tableId === table.id && !o.simulated && o.status !== "completed" && o.status !== "cancelled");
      for (const o of moving) await updateOrder(o.id, { tableId: target.id });
      await saveTable({ ...table, status: "available" });
      await saveTable({ ...target, status: "seated" });
      return NextResponse.json({ ok: true, action: "move", moved: moving.length, from: table.id, to: target.id });
    }

    const status = parsed.data.action === "seat" ? "seated" : "available";
    await saveTable({ ...table, status }); // logs the seat/clear transition
    return NextResponse.json({ ok: true, status });
  },
);
