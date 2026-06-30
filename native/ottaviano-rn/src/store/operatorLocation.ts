import { create } from "zustand";
import type { LocationDTO } from "@/api/types";
import { getLocations } from "@/api/public";

/**
 * The operator's currently-selected location — the native analogue of the web
 * admin's location context (`useAdminLocationV3`). Several operator surfaces are
 * per-location (POS open checks, the floor/service map): their `/api/v1/admin/*`
 * endpoints **require** a `?location=` and 422 with "location is required" without
 * one. This store loads the active locations once and holds the active slug
 * (defaulting to the first) so those surfaces have a location to scope to and can
 * switch between sites. Global (not per-screen) so the choice survives navigating
 * between surfaces.
 */

interface OperatorLocationState {
  slug: string | null;
  locations: LocationDTO[];
  loading: boolean;
  error: string | null;
  setSlug: (slug: string) => void;
  /** Idempotent — fetches the active locations once and seeds the default slug. */
  ensureLoaded: () => Promise<void>;
}

export const useOperatorLocation = create<OperatorLocationState>((set, get) => ({
  slug: null,
  locations: [],
  loading: false,
  error: null,
  setSlug: (slug) => set({ slug }),
  ensureLoaded: async () => {
    const s = get();
    if (s.loading || s.locations.length > 0) return;
    set({ loading: true, error: null });
    try {
      const locations = await getLocations();
      set((prev) => ({
        locations,
        loading: false,
        slug: prev.slug ?? locations[0]?.slug ?? null,
      }));
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Could not load locations" });
    }
  },
}));
