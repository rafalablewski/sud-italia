// Sync seed accessor for the menu catalogue.
//
// Lives separately from `./index.ts` so client components ("use client")
// can read the seed without pulling the store module's server-only
// dependencies (Drizzle, node:async_hooks) into the browser bundle.
// Rule #3 — server-side modules can't reach client.
//
// The `index.ts` module re-exports `getMenu` from here for server
// callers that prefer the canonical `@/data/menus` entry point.

import type { MenuItem } from "../types";
import { krakowMenu } from "./krakow";
import { warszawaMenu } from "./warszawa";

const baseMenus: Record<string, MenuItem[]> = {
  krakow: krakowMenu,
  warszawa: warszawaMenu,
};

export function getMenu(locationSlug: string): MenuItem[] {
  return baseMenus[locationSlug] ?? [];
}
