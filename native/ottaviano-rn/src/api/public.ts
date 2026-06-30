import { apiRequest } from "./client";
import type { LocationDTO, MenuItemDTO } from "./types";

/** Public (no-auth) reads — locations + the customer menu. Prices in grosze. */
export async function getLocations(): Promise<LocationDTO[]> {
  const { data } = await apiRequest<LocationDTO[]>("/locations");
  return data ?? [];
}

export async function getMenu(locationSlug: string): Promise<MenuItemDTO[]> {
  const { data } = await apiRequest<MenuItemDTO[]>(`/menu?location=${encodeURIComponent(locationSlug)}`);
  return data ?? [];
}
