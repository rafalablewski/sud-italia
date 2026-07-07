import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getMenuWithOverrides } from "@/data/menus";
import { getUpsellSettings } from "@/lib/store";
import { getActiveComboDeals, type UpsellConfig } from "@/lib/upsell";
import type { CartItem, FulfillmentType, MenuCategory } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/admin/pos/combos` — the POS "complete the deal" prompt, the native
 * twin of the web ticket's combo banner. Body `{ locationSlug, itemIds: string[],
 * channel? }` where `itemIds` is the flat unit list of the open check (repeat an
 * id per quantity). Runs the SAME `getActiveComboDeals` engine the storefront +
 * web till use (Rule #1 — real deals off real menu + the location's upsell config),
 * and resolves `completeIds`: the menu-item ids the till should add to finish the
 * deal, so the client can complete it in one tap. Staff+, location-scoped.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  let body: { locationSlug?: string; itemIds?: unknown; channel?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  if (!body || typeof body !== "object") return apiError("bad_request", "Body must be an object");
  const locationSlug = typeof body.locationSlug === "string" ? body.locationSlug.toLowerCase() : "";
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((x): x is string => typeof x === "string") : [];
  const channel = (["dine-in", "takeout", "delivery"].includes(body.channel as string) ? body.channel : null) as FulfillmentType | null;
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

    const upsell = (await getUpsellSettings()) as Record<string, UpsellConfig | undefined>;
    const config = upsell[locationSlug] ?? null;
    const r = getActiveComboDeals(cart, config, channel ?? undefined);

    if (!r.activeDeal) return apiOk({ activeDeal: null }, { location: locationSlug });

    // Resolve the ids that would complete the deal — the same resolution the web
    // ticket's "complete combo" button uses (required item by suffix, else the
    // cheapest available item in a missing category, else repeat to hit minItems).
    const avail = menu.filter((m) => m.available);
    const completeIds: string[] = [];
    if (r.activeDeal.requiredItems) {
      for (const label of r.missingItems) {
        const req = r.activeDeal.requiredItems.find((x) => x.label === label);
        const m = req && avail.find((x) => x.id.endsWith(req.suffix));
        if (m) completeIds.push(m.id);
      }
    }
    for (const cat of r.missingCategories) {
      const m = avail.filter((x) => x.category === (cat as MenuCategory)).sort((a, b) => a.price - b.price)[0];
      if (m) completeIds.push(m.id);
    }
    if (completeIds.length === 0 && r.missingQuantity > 0 && cart[0]) completeIds.push(cart[0].menuItem.id);

    return apiOk(
      {
        activeDeal: { id: r.activeDeal.id, name: r.activeDeal.name, description: r.activeDeal.description, discountPercent: r.activeDeal.discountPercent },
        savings: r.savings,
        missingItems: r.missingItems,
        missingCategories: r.missingCategories,
        missingQuantity: r.missingQuantity,
        isComplete: r.isComplete,
        completeIds,
      },
      { location: locationSlug },
    );
  } catch (err) {
    logger.error("v1 pos combos failed", { layer: "api.v1.admin.pos.combos" }, err as Error);
    return apiError("internal", "Could not compute combo deals");
  }
}
