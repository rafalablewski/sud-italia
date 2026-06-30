import { create } from "zustand";
import type { PublicSettingsDTO } from "@/api/types";
import { getPublicSettings } from "@/api/public";

/**
 * Shared storefront programme config — fetched once from `/settings/public`
 * and reused by the Menu (combos, speed guarantee), Cart (delivery/tip/combo
 * math) and Rewards (tier ladder, rewards catalogue, referral) screens. A
 * single fetch keeps the operator's loyalty/combo edits consistent across
 * every customer surface (loyalty.md rule #1 — never hardcode programme copy).
 */

interface SettingsState {
  settings: PublicSettingsDTO | null;
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,
  load: async (force = false) => {
    if (get().loading) return;
    if (get().settings && !force) return;
    set({ loading: true, error: null });
    try {
      const settings = await getPublicSettings();
      set({ settings, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Could not load settings" });
    }
  },
}));
