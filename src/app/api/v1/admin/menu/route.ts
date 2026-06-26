import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getMenuWithOverrides } from "@/data/menus";
import { setMenuOverride } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Resolve the single location to operate on (admin menu is per-location). */
function resolveLocation(req: NextRequest, scope: string): string | { error: ReturnType<typeof apiError> } {
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested) {
    if (!scopeAllows(scope, requested)) return { error: apiError("forbidden", `Not authorized for location "${requested}"`) };
    return requested;
  }
  const allowed = scopedLocations(scope);
  if (allowed && allowed.length >= 1) return allowed[0];
  return "krakow"; // unrestricted default; the app always passes ?location
}

/**
 * `GET /api/v1/admin/menu?location=` — the operator menu for one site (mirrors
 * web `/admin/menu`): customer fields plus operator cost + availability so the
 * app can show margin and 86 items. Manager+.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  try {
    const items = await getMenuWithOverrides(loc);
    return apiOk(
      items.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        price: m.price,
        cost: m.cost,
        category: m.category,
        available: m.available,
        tags: m.tags,
        menuRole: m.menuRole ?? null,
        sku: m.sku ?? null,
        prepTimeMinutes: m.prepTimeMinutes ?? null,
        isLimited: m.isLimited ?? false,
      })),
      { location: loc, count: items.length },
    );
  } catch (err) {
    logger.error("v1 admin menu failed", { layer: "api.v1.admin.menu" }, err as Error);
    return apiError("internal", "Could not load the menu");
  }
}

/**
 * `PATCH /api/v1/admin/menu` — 86 / un-86 an item. Body `{ itemId, available }`.
 * Writes a per-location-agnostic menu override (availability is chain-level in
 * the override store, matching the web admin toggle). Manager+.
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  let body: { itemId?: string; available?: boolean };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  if (!body.itemId || typeof body.available !== "boolean") {
    return apiError("validation_failed", "itemId (string) and available (boolean) are required");
  }
  try {
    await setMenuOverride(body.itemId, { available: body.available });
    return apiOk({ itemId: body.itemId, available: body.available });
  } catch (err) {
    logger.error("v1 admin menu patch failed", { layer: "api.v1.admin.menu" }, err as Error);
    return apiError("internal", "Could not update the item");
  }
}
