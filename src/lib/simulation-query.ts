import type { NextRequest } from "next/server";

/** Parse a `days` query param shared across every simulation analytics
 *  route (actuals / cohorts / dayparts / hourly / menu-engineering / sssg).
 *  Clamps to [1, 365] and falls back to the route's default when missing
 *  or invalid. Extracted from per-route inline parsers — single source of
 *  truth keeps the window semantics consistent across the dashboard. */
export function parseWindowDays(req: NextRequest, defaultDays: number): number {
  const raw = req.nextUrl.searchParams.get("days");
  if (raw === null) return defaultDays;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultDays;
  return Math.min(365, parsed);
}
