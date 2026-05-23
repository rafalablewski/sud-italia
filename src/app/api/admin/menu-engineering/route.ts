import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeMenuEngineering } from "@/lib/store";
import { parseWindowDays } from "@/lib/simulation-query";

/**
 * Standalone Kasavana-Smith menu-engineering matrix over real order line
 * items. Same computeMenuEngineering() the simulation workbench uses, but
 * surfaced on its own discoverable admin page (/admin/menu-engineering)
 * instead of buried behind the simulation feature flag.
 *
 * Manager+ only. locationParam enforces per-location scope when a slug is
 * supplied; the default (no slug) is the chain-wide view, allowed only for
 * sessions holding unrestricted scope per withAdmin.
 *
 * Heavy read (full orders table over the window) — cached 60s so tab
 * switches and window changes don't re-roll the aggregation each time.
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const windowDays = parseWindowDays(req, 90);
    const items = await computeMenuEngineering(windowDays, undefined, locationSlug ?? undefined);
    return NextResponse.json(
      { windowDays, location: locationSlug ?? "", items },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  },
);
