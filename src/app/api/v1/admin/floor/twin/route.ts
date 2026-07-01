import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getFloorEvents, getOrders, getTables, saveTable, updateOrder } from "@/lib/store";
import { buildFloorTwin } from "@/lib/floor-twin";
import { analyzeTruck } from "@/lib/kds-prediction";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Resolve the single location a floor view needs (the twin is per-room). */
function resolveLocation(req: NextRequest, scope: string): string | { error: ReturnType<typeof apiError> } {
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested) {
    if (!scopeAllows(scope, requested)) return { error: apiError("forbidden", `Not authorized for location "${requested}"`) };
    return requested;
  }
  const allowed = scopedLocations(scope); // null = unrestricted
  if (allowed && allowed.length === 1) return allowed[0];
  return { error: apiError("validation_failed", "Specify `location` — the floor plan is per-restaurant") };
}

/**
 * `GET /api/v1/admin/floor/twin?location=` — the live room: per-table occupancy,
 * realized dwell + spend velocity, predicted free-in, plus the kitchen-bottleneck
 * signal. Mirrors web `/core/service/floor` (`/api/admin/floor-twin`). Staff+,
 * location-scoped. Reuses the shared `buildFloorTwin` engine (no duplicated logic).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;

  try {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [tables, orders, events] = await Promise.all([
      getTables(loc),
      getOrders(loc, since),
      getFloorEvents(loc, since),
    ]);

    const twin = buildFloorTwin({
      transitions: events.map((e) => ({ tableId: e.tableId, from: e.from, to: e.to, at: e.at })),
      tables: tables.map((t) => ({ id: t.id, number: t.number, seats: t.seats, zone: t.zone, status: t.status, notes: t.notes })),
      orders: orders.map((o) => ({
        tableId: o.tableId, partySize: o.partySize, totalAmount: o.totalAmount, status: o.status,
        createdAt: o.createdAt, paidAt: o.paidAt, fulfillmentType: o.fulfillmentType, simulated: o.simulated,
      })),
    });

    const bn = analyzeTruck(orders, Date.now()).bottleneck;
    const kitchen =
      bn && bn.tier !== "calm"
        ? { tier: bn.tier, station: bn.id as string, label: MENU_CATEGORY_LABELS[bn.id] ?? bn.id, util: Math.round(bn.util * 100) }
        : { tier: "calm" as const, station: null as string | null, label: null as string | null, util: bn ? Math.round(bn.util * 100) : 0 };

    return apiOk({ twin, kitchen }, { location: loc });
  } catch (err) {
    logger.error("v1 floor twin failed", { layer: "api.v1.admin.floor.twin" }, err as Error);
    return apiError("internal", "Could not load the floor");
  }
}

/**
 * `POST /api/v1/admin/floor/twin?location=` — seat or clear a table. Body
 * `{ action: "seat" | "clear", tableId }`. Flips table status (logged as a
 * transition that feeds the measured-dwell loop). Staff+, location-scoped.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;

  let body: { action?: string; tableId?: string; toTableId?: string };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }
  const action = String(body.action ?? "");
  const tableId = String(body.tableId ?? "").trim();
  if (action !== "seat" && action !== "clear" && action !== "move")
    return apiError("validation_failed", "action must be seat, clear or move");
  if (!tableId) return apiError("validation_failed", "tableId is required");

  try {
    const tables = await getTables(loc);
    const table = tables.find((t) => t.id === tableId);
    if (!table) return apiError("not_found", "Unknown table");

    // Move — relocate a seated party (and its open dine-in check) to another
    // table: reassign the source table's active orders, free the source, seat
    // the target. The check follows the party; the Twin re-derives dwell. Mirrors
    // the web `/api/admin/floor-twin` move action (one behaviour, two facades).
    if (action === "move") {
      const toTableId = String(body.toTableId ?? "").trim();
      const target = toTableId ? tables.find((t) => t.id === toTableId) : undefined;
      if (!target) return apiError("not_found", "Unknown destination table");
      if (target.id === table.id) return apiError("validation_failed", "Pick a different table");
      if (target.status === "out-of-service") return apiError("validation_failed", "Destination is out of service");
      const orders = await getOrders(loc);
      const moving = orders.filter(
        (o) => o.tableId === table.id && !o.simulated && o.status !== "completed" && o.status !== "cancelled",
      );
      for (const o of moving) await updateOrder(o.id, { tableId: target.id });
      await saveTable({ ...table, status: "available" });
      await saveTable({ ...target, status: "seated" });
      return apiOk({ ok: true, action: "move", moved: moving.length, from: table.id, to: target.id }, { location: loc });
    }

    const status = action === "seat" ? "seated" : "available";
    await saveTable({ ...table, status });
    return apiOk({ ok: true, tableId, status }, { location: loc });
  } catch (err) {
    logger.error("v1 floor seat/clear/move failed", { layer: "api.v1.admin.floor.twin" }, err as Error);
    return apiError("internal", "Could not update the table");
  }
}
