import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import { getSlots, updateSlot } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/slots?date=YYYY-MM-DD` — fulfilment time-slots for the Core
 * Service surface, mirroring `/core/service/slots`. Staff+; location-scoped.
 * `date` is optional (omit for all upcoming).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  const date = req.nextUrl.searchParams.get("date")?.trim() || undefined;
  try {
    const all = await getSlots(undefined, date);
    const slots = (filter.slugs === null ? [...all] : all.filter((s) => filter.slugs!.includes(s.locationSlug)))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return apiOk(slots, { count: slots.length });
  } catch (err) {
    logger.error("v1 admin slots failed", { layer: "api.v1.admin.slots" }, err as Error);
    return apiError("internal", "Could not load slots");
  }
}

/**
 * `PATCH /api/v1/admin/slots` — tune a fulfilment slot's capacity / status,
 * mirroring the web Service surface. Body `{ id, maxOrders?, status? }`.
 * Manager+; the slot's location must be in scope. `maxOrders` can't be set below
 * the slot's already-booked `currentOrders`; `status` ∈ {draft, active}.
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { id?: string; maxOrders?: number; status?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const id = String(body.id ?? "").trim();
  if (!id) return apiError("validation_failed", "id is required");
  const wantsCapacity = body.maxOrders !== undefined;
  const wantsStatus = body.status !== undefined;
  if (!wantsCapacity && !wantsStatus) {
    return apiError("validation_failed", "Provide maxOrders and/or status");
  }
  if (wantsStatus && body.status !== "draft" && body.status !== "active") {
    return apiError("validation_failed", "status must be 'draft' or 'active'");
  }

  try {
    const slot = (await getSlots(undefined, undefined)).find((s) => s.id === id);
    if (!slot) return apiError("not_found", "Unknown slot");
    if (!scopeAllows(guard.claims.scope, slot.locationSlug)) {
      return apiError("forbidden", `Not authorized for location "${slot.locationSlug}"`);
    }

    const updates: { maxOrders?: number; status?: "draft" | "active" } = {};
    if (wantsCapacity) {
      const cap = Number(body.maxOrders);
      if (!Number.isInteger(cap) || cap < 0 || cap > 1000) {
        return apiError("validation_failed", "maxOrders must be an integer in 0..1000");
      }
      if (cap < slot.currentOrders) {
        return apiError("validation_failed", `maxOrders can't be below the ${slot.currentOrders} already booked`);
      }
      updates.maxOrders = cap;
    }
    if (wantsStatus) updates.status = body.status as "draft" | "active";

    const saved = await updateSlot(id, updates);
    if (!saved) return apiError("not_found", "Unknown slot");
    return apiOk(saved);
  } catch (err) {
    logger.error("v1 admin slots patch failed", { layer: "api.v1.admin.slots" }, err as Error);
    return apiError("internal", "Could not update the slot");
  }
}
