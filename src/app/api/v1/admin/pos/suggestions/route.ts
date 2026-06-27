import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getMenuWithOverrides } from "@/data/menus";
import { getCartSuggestions } from "@/lib/upsell";
import type { CartItem } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/admin/pos/suggestions` — cross-sell chips for the POS ticket, the
 * native twin of the web POS "complete your meal" panel. Body
 * `{ locationSlug, itemIds: string[] }`. Builds CartItems from the live menu and
 * runs the SAME `getCartSuggestions` engine the storefront uses (Rule #1 — real
 * pairings off real menu data, the four-slot espresso→dessert→bread→drink panel).
 * Staff+, location-scoped.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  let body: { locationSlug?: string; itemIds?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  if (!body || typeof body !== "object") return apiError("bad_request", "Body must be an object");
  const locationSlug = typeof body.locationSlug === "string" ? body.locationSlug.toLowerCase() : "";
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((x): x is string => typeof x === "string") : [];
  if (!locationSlug) return apiError("validation_failed", "locationSlug is required");
  if (!scopeAllows(guard.claims.scope, locationSlug)) {
    return apiError("forbidden", `Not authorized for location "${locationSlug}"`);
  }

  try {
    const menu = await getMenuWithOverrides(locationSlug);
    const byId = new Map(menu.map((m) => [m.id, m]));
    const cart: CartItem[] = itemIds
      .map((id) => byId.get(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((menuItem) => ({ menuItem, quantity: 1, locationSlug }));

    const suggestions = getCartSuggestions(cart, menu).map((s) => ({
      id: s.item.id,
      name: s.item.name,
      price: s.item.price,
      reason: s.reason,
    }));
    return apiOk(suggestions, { location: locationSlug, count: suggestions.length });
  } catch (err) {
    logger.error("v1 pos suggestions failed", { layer: "api.v1.admin.pos" }, err as Error);
    return apiError("internal", "Could not compute suggestions");
  }
}
