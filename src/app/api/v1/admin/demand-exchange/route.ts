import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { appendAuditLog, getDemandSignals, getOrders, getSlots, updateSlot } from "@/lib/store";
import { buildDemandBoard, demonstratedCoversPerHour, type DemandBoard } from "@/lib/demand-exchange";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function resolveLocation(req: NextRequest, scope: string): string | { error: ReturnType<typeof apiError> } {
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested) {
    if (!scopeAllows(scope, requested)) return { error: apiError("forbidden", `Not authorized for location "${requested}"`) };
    return requested;
  }
  const allowed = scopedLocations(scope);
  if (allowed && allowed.length === 1) return allowed[0];
  return { error: apiError("validation_failed", "Specify `location`") };
}

/** Compose the demand board for a location/date — same logic the web route runs. */
async function loadBoard(locationSlug: string, date: string): Promise<DemandBoard> {
  const [slots, allOrders, signals] = await Promise.all([
    getSlots(locationSlug, date),
    getOrders(),
    getDemandSignals(locationSlug, date),
  ]);
  const locOrders = allOrders.filter((o) => o.locationSlug === locationSlug);
  const cutoff = Date.now() - 90 * 86_400_000;
  const instants = locOrders
    .filter((o) => o.status !== "pending" && o.status !== "cancelled" && !o.simulated)
    .map((o) => new Date(o.paidAt ?? o.createdAt).getTime())
    .filter((ms) => ms >= cutoff);
  const kitchenCoversPerHour = demonstratedCoversPerHour(instants);

  return buildDemandBoard({
    date,
    slots: slots.map((s) => ({
      id: s.id, date: s.date, time: s.time, maxOrders: s.maxOrders, currentOrders: s.currentOrders,
      fulfillmentTypes: s.fulfillmentTypes, status: s.status, minSpendGrosze: s.minSpendGrosze,
    })),
    orders: locOrders.map((o) => ({
      slotDate: o.slotDate, slotTime: o.slotTime, status: o.status, simulated: o.simulated, totalAmount: o.totalAmount,
    })),
    signals: signals.map((s) => ({ date: s.date, time: s.time })),
    kitchenCoversPerHour,
  });
}

function dateParam(req: NextRequest): string {
  return req.nextUrl.searchParams.get("date")?.trim() || new Date().toISOString().slice(0, 10);
}

/**
 * `GET /api/v1/admin/demand-exchange?location=&date=` — the per-slot demand board:
 * forecast covers vs advertised + kitchen-throughput capacity, the yield tier
 * (under/healthy/tight/over/kitchen-capped) and the recommended lever. Mirrors web
 * `/admin/demand-exchange`. Manager+. All from live data (no mock demand).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  try {
    const board = await loadBoard(loc, dateParam(req));
    return apiOk({ board }, { location: loc });
  } catch (err) {
    logger.error("v1 demand-exchange failed", { layer: "api.v1.admin.demand" }, err as Error);
    return apiError("internal", "Could not load the demand board");
  }
}

/**
 * `POST /api/v1/admin/demand-exchange?location=` — apply the demand-matched
 * capacity. Body `{ slotId, maxOrders, minSpendGrosze? }` resizes one slot, or
 * `{ mode: "apply-all" }` re-derives the board server-side and resizes every slot
 * whose recommendation differs (capacities are the system's, never client-supplied).
 * Manager+; audited via `slots.resize`.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  const actor = guard.claims.name ?? guard.claims.sub;

  let body: { mode?: string; slotId?: string; maxOrders?: number; minSpendGrosze?: number };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }

  try {
    if (body.mode === "apply-all") {
      const board = await loadBoard(loc, dateParam(req));
      let applied = 0;
      for (const r of board.slots) {
        if (r.recommendedMaxOrders === r.maxOrders && r.recommendedMinSpendGrosze === r.minSpendGrosze) continue;
        const updated = await updateSlot(r.slotId, {
          maxOrders: r.recommendedMaxOrders,
          minSpendGrosze: r.recommendedMinSpendGrosze || undefined,
        });
        if (updated) {
          applied += 1;
          await appendAuditLog({
            actor, action: "slots.resize", entityType: "slot", entityId: r.slotId,
            before: { maxOrders: r.maxOrders, minSpendGrosze: r.minSpendGrosze },
            after: { maxOrders: r.recommendedMaxOrders, minSpendGrosze: r.recommendedMinSpendGrosze, source: "demand-exchange.apply-all" },
          });
        }
      }
      return apiOk({ ok: true, applied }, { location: loc });
    }

    const slotId = String(body.slotId ?? "").trim();
    const maxOrders = Math.round(Number(body.maxOrders));
    if (!slotId) return apiError("validation_failed", "slotId is required");
    if (!Number.isFinite(maxOrders) || maxOrders < 1 || maxOrders > 1000) {
      return apiError("validation_failed", "maxOrders must be 1–1000");
    }
    const minSpend = Number.isFinite(Number(body.minSpendGrosze)) ? Math.max(0, Math.round(Number(body.minSpendGrosze))) : undefined;
    const updated = await updateSlot(slotId, { maxOrders, minSpendGrosze: minSpend || undefined });
    if (!updated) return apiError("not_found", "Unknown slot");
    await appendAuditLog({
      actor, action: "slots.resize", entityType: "slot", entityId: slotId,
      after: { maxOrders, minSpendGrosze: minSpend ?? 0, source: "demand-exchange" },
    });
    return apiOk({ ok: true, slotId, maxOrders }, { location: loc });
  } catch (err) {
    logger.error("v1 demand-exchange apply failed", { layer: "api.v1.admin.demand" }, err as Error);
    return apiError("internal", "Could not apply the capacity");
  }
}
