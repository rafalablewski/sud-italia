import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import { getComplianceItems, saveComplianceItem } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/compliance` — licences & inspections with expiry, mirroring
 * web `/admin/compliance`. Manager+; location-scoped. Soonest-expiring first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getComplianceItems();
    const now = Date.now();
    const items = (filter.slugs === null ? all : all.filter((c) => filter.slugs!.includes(c.locationSlug)))
      .map((c) => ({
        id: c.id,
        locationSlug: c.locationSlug,
        kind: c.kind,
        title: c.title,
        expiresAt: c.expiresAt,
        expired: new Date(c.expiresAt).getTime() < now,
        lastRenewedAt: c.lastRenewedAt ?? null,
      }))
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    return apiOk(items, { count: items.length, expired: items.filter((i) => i.expired).length });
  } catch (err) {
    logger.error("v1 admin compliance failed", { layer: "api.v1.admin.compliance" }, err as Error);
    return apiError("internal", "Could not load compliance items");
  }
}

/**
 * `PATCH /api/v1/admin/compliance` — renew a licence/inspection: set its new
 * expiry and stamp `lastRenewedAt` to today, mirroring the web renew action. Body
 * `{ id, expiresAt }` (ISO date). Manager+; the item's location must be in scope.
 * Re-saves via `saveComplianceItem` (upsert) so every other field is preserved.
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { id?: string; expiresAt?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const id = String(body.id ?? "").trim();
  const expiresAtRaw = String(body.expiresAt ?? "").trim();
  const expiryMs = new Date(expiresAtRaw).getTime();
  if (!id || !expiresAtRaw || Number.isNaN(expiryMs)) {
    return apiError("validation_failed", "id and a valid expiresAt date are required");
  }

  try {
    const item = (await getComplianceItems()).find((c) => c.id === id);
    if (!item) return apiError("not_found", "Unknown compliance item");
    if (!scopeAllows(guard.claims.scope, item.locationSlug)) {
      return apiError("forbidden", `Not authorized for location "${item.locationSlug}"`);
    }
    const nowIso = new Date().toISOString();
    const saved = await saveComplianceItem({
      ...item,
      expiresAt: new Date(expiryMs).toISOString(),
      lastRenewedAt: nowIso,
    });
    return apiOk({
      id: saved.id,
      locationSlug: saved.locationSlug,
      kind: saved.kind,
      title: saved.title,
      expiresAt: saved.expiresAt,
      expired: new Date(saved.expiresAt).getTime() < Date.now(),
      lastRenewedAt: saved.lastRenewedAt ?? null,
    });
  } catch (err) {
    logger.error("v1 admin compliance patch failed", { layer: "api.v1.admin.compliance" }, err as Error);
    return apiError("internal", "Could not renew the compliance item");
  }
}
