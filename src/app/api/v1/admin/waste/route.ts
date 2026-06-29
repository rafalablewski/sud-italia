import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getWasteLogs, saveWasteLog } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/waste` — spoilage / wastage log, mirroring web `/admin/waste`.
 * Staff+; location-scoped. getWasteLogs is per-location, so we fan out across the
 * caller's allowed sites and merge. Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const { scope } = guard.claims;

  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }

  let slugs: string[];
  if (requested) slugs = [requested];
  else {
    const allowed = scopedLocations(scope);
    slugs = allowed ?? (await getActiveLocationsAsync()).map((l) => l.slug);
  }

  try {
    const lists = await Promise.all(slugs.map((s) => getWasteLogs(s, { limit: 100 })));
    const entries = lists
      .flat()
      .map((w) => ({
        id: w.id,
        locationSlug: w.locationSlug,
        item: w.item,
        quantity: w.quantity,
        unit: w.unit,
        reason: w.reason,
        estimatedCostGrosze: w.estimatedCostGrosze ?? null,
        recordedAt: w.recordedAt,
      }))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    return apiOk(entries, { count: entries.length });
  } catch (err) {
    logger.error("v1 admin waste failed", { layer: "api.v1.admin.waste" }, err as Error);
    return apiError("internal", "Could not load the waste log");
  }
}

const WASTE_REASONS = new Set([
  "spoilage",
  "prep_error",
  "dropped",
  "overproduction",
  "customer_return",
  "expired",
  "other",
]);

/**
 * `POST /api/v1/admin/waste` — log a discarded item, mirroring web `/admin/waste`
 * POST. Body `{ locationSlug, item, quantity, unit, reason, estimatedCostGrosze?,
 * notes?, recordedBy? }`. Staff+; the location must be in scope.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  let body: {
    locationSlug?: string;
    item?: string;
    quantity?: number;
    unit?: string;
    reason?: string;
    estimatedCostGrosze?: number;
    notes?: string;
    recordedBy?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const loc = String(body.locationSlug ?? "").trim().toLowerCase();
  const item = String(body.item ?? "").trim().slice(0, 120);
  const quantity = Number(body.quantity);
  const unit = String(body.unit ?? "").trim().slice(0, 24);
  const reason = String(body.reason ?? "");
  if (!loc || !item || !unit || !WASTE_REASONS.has(reason)) {
    return apiError("validation_failed", "locationSlug, item, unit and a valid reason are required");
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) {
    return apiError("validation_failed", "quantity must be positive");
  }
  if (!scopeAllows(guard.claims.scope, loc)) {
    return apiError("forbidden", `Not authorized for location "${loc}"`);
  }
  const cost = Number(body.estimatedCostGrosze);
  try {
    const entry = await saveWasteLog({
      locationSlug: loc,
      item,
      quantity,
      unit,
      reason: reason as Parameters<typeof saveWasteLog>[0]["reason"],
      estimatedCostGrosze: Number.isInteger(cost) && cost >= 0 ? cost : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || undefined : undefined,
      recordedBy:
        typeof body.recordedBy === "string" && body.recordedBy.trim()
          ? body.recordedBy.trim().slice(0, 120)
          : guard.claims.name ?? guard.claims.sub,
    });
    return apiOk(
      {
        id: entry.id,
        locationSlug: entry.locationSlug,
        item: entry.item,
        quantity: entry.quantity,
        unit: entry.unit,
        reason: entry.reason,
        estimatedCostGrosze: entry.estimatedCostGrosze ?? null,
        recordedAt: entry.recordedAt,
      },
      undefined,
      201,
    );
  } catch (err) {
    logger.error("v1 admin waste create failed", { layer: "api.v1.admin.waste" }, err as Error);
    return apiError("internal", "Could not record waste");
  }
}
