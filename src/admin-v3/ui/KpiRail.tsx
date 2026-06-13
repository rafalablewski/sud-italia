"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { SkeletonKpiRail } from "./Skeleton";

/**
 * The KPI rail with its loading gate baked in. Use this instead of a bare
 * `<div className="av3-kpi-rail">` whenever the tiles read from fetched data:
 * while `loading` and the data is still `empty`, it renders a `SkeletonKpiRail`
 * sized to the tile count, so the rail never flashes `0` / `0 zł` / `—` on the
 * first paint and then jumps to the real number once the request resolves.
 *
 * Props:
 * - `loading` — the page's first-load flag. Defaults `false`, so a bare
 *   `<KpiRail>` (e.g. a rail fed by synchronous data) just renders the rail.
 * - `empty` — whether the underlying data is still empty. Defaults `true` so
 *   `loading` alone gates — correct for config objects that start `{}`/`null`.
 *   Pass `list.length === 0` for array-backed rails so a genuinely empty
 *   dataset still shows the real (zeroed) rail rather than a stuck skeleton.
 * - `count` — override the skeleton tile count; defaults to the number of
 *   child tiles so the placeholder matches the loaded layout.
 *
 * The guardrail test in `tests/kpi-rail-guard.test.ts` enforces that no admin
 * page hand-rolls a bare `.av3-kpi-rail` without a loading guard — reach for
 * this component rather than re-deriving the ternary.
 */
export function KpiRail({
  loading = false,
  empty = true,
  count,
  children,
}: {
  loading?: boolean;
  empty?: boolean;
  count?: number;
  children: ReactNode;
}) {
  if (loading && empty) {
    const n = count ?? Children.toArray(children).filter(isValidElement).length;
    return <SkeletonKpiRail count={n} />;
  }
  return <div className="av3-kpi-rail">{children}</div>;
}
