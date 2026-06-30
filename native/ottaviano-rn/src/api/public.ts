import { apiRequest } from "./client";
import type {
  LocationDTO,
  MenuItemDTO,
  PublicSettingsDTO,
  UpsellSuggestionDTO,
} from "./types";

/** Public (no-auth) reads — locations, the customer menu, the storefront
 *  programme config, and the cross-sell rail. Prices are always grosze. */

export async function getLocations(): Promise<LocationDTO[]> {
  const { data } = await apiRequest<LocationDTO[]>("/locations");
  return data ?? [];
}

export async function getMenu(locationSlug: string): Promise<MenuItemDTO[]> {
  const { data } = await apiRequest<MenuItemDTO[]>(`/menu?location=${encodeURIComponent(locationSlug)}`);
  return data ?? [];
}

/** Loyalty programme + combos + speed-guarantee + delivery/tip/min-order
 *  config — the one read that powers the Rewards ladder, the menu combos and
 *  the cart's money math. Operator-tuned, so edits land with no app release. */
export async function getPublicSettings(): Promise<PublicSettingsDTO> {
  const { data } = await apiRequest<PublicSettingsDTO>("/settings/public");
  return data;
}

/** Cross-sell "complete your meal" rail for the current cart — the same
 *  getCartSuggestions engine the storefront uses (CLAUDE upsell rule). */
export async function getCartUpsell(
  locationSlug: string,
  itemIds: string[],
): Promise<UpsellSuggestionDTO[]> {
  if (itemIds.length === 0) return [];
  const { data } = await apiRequest<UpsellSuggestionDTO[]>("/upsell", {
    method: "POST",
    body: { locationSlug, itemIds },
  });
  return data ?? [];
}
