import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { UpsellRequestSchema, type UpsellSuggestionDTO } from "@/lib/api/v1/schemas";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { getCartSuggestions } from "@/lib/upsell";
import type { CartItem } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/upsell` — the storefront "complete your meal" rail for the
 * customer app's cart + post-order surfaces. Body `{ locationSlug, itemIds }`.
 *
 * Public (no auth) — the cross-sell rail is a zero-friction guest surface
 * (Rule #6), the customer twin of the staff `…/admin/pos/suggestions`. It runs
 * the SAME `getCartSuggestions` engine off the live menu (Rule #1 — real
 * pairings, the four-slot espresso → tiramisù → garlic bread → limonata panel
 * the CLAUDE upsell rule mandates for every pizza/pasta cart). Prices stay in
 * grosze; the app formats via `formatMoney`.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = UpsellRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("validation_failed", "Invalid request", parsed.error.issues);
  }
  const locationSlug = parsed.data.locationSlug.toLowerCase();

  const active = await getActiveLocationsAsync();
  if (!active.some((l) => l.slug === locationSlug)) {
    return apiError("not_found", `No active location "${locationSlug}"`);
  }

  try {
    const menu = await getMenuWithOverrides(locationSlug);
    const byId = new Map(menu.map((m) => [m.id, m]));
    const cart: CartItem[] = parsed.data.itemIds
      .map((id) => byId.get(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((menuItem) => ({ menuItem, quantity: 1, locationSlug }));

    const suggestions: UpsellSuggestionDTO[] = getCartSuggestions(cart, menu).map((s) => ({
      id: s.item.id,
      name: s.item.name,
      description: s.item.description,
      price: s.item.price, // grosze
      category: s.item.category,
      reason: s.reason,
    }));
    return apiOk(suggestions, { location: locationSlug, count: suggestions.length });
  } catch (err) {
    logger.error("v1 upsell failed", { layer: "api.v1.upsell" }, err as Error);
    return apiError("internal", "Could not compute suggestions");
  }
}
