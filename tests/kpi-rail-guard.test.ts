// Regression guard for the KPI-rail loading flash.
//
// A `.av3-kpi-rail` whose tiles read from data fetched on mount renders
// `0` / `0 zł` / `—` on first paint and then jumps to the real number once the
// request resolves. The fix is a loading gate. The reusable `<KpiRail>`
// primitive (src/admin-v3/ui/KpiRail.tsx) bakes that gate in, so a migrated
// page no longer contains a bare `av3-kpi-rail` string at all.
//
// This test fails if any admin-v3 page hand-rolls a bare `.av3-kpi-rail`
// without a page-level early-return skeleton guard. The allowed shapes are:
//   1. `<KpiRail loading={…} empty={…}>…</KpiRail>`  (preferred — the class
//      lives inside the primitive, so the page source has no raw rail), or
//   2. an early `if (loading…) return <Skeleton… />` so the rail never renders
//      while the page is still loading (used by a handful of whole-page
//      skeleton pages: Calculator, Currency, Payments, Permissions,
//      QrOrdering, Regulatory, Integrations, Languages).
//
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_V3 = join(process.cwd(), "src/admin-v3");
const RAW_RAIL = 'className="av3-kpi-rail"';
// A whole-page skeleton return while loading — `if (loading) return <Skeleton…`
// or `if (loading || !data) return <Skeleton…`. Kept deliberately loose; the
// point is that the page bails to a skeleton before the rail can render empty.
const EARLY_RETURN = /if\s*\(\s*loading[\s\S]{0,40}?\)\s*return\s*<Skeleton/;

test("admin-v3 KPI rails are loading-gated (use <KpiRail> or an early skeleton return)", () => {
  const files = readdirSync(ADMIN_V3).filter((f) => f.endsWith("V3.tsx"));
  // Sanity: we are actually scanning the page components.
  assert.ok(files.length > 20, `expected to find the admin-v3 pages, saw ${files.length}`);

  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(join(ADMIN_V3, file), "utf8");
    if (!src.includes(RAW_RAIL)) continue; // goes through <KpiRail>, or has no rail
    if (EARLY_RETURN.test(src)) continue; // whole-page skeleton guard
    offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    `These admin-v3 pages render a bare .av3-kpi-rail without a loading guard, so the tiles ` +
      `flash 0/0 zł and then jump once the fetch resolves. Wrap the rail in ` +
      `<KpiRail loading={loading} empty={list.length === 0}> (preferred) or early-return a ` +
      `<Skeleton… /> while loading:\n  ${offenders.join("\n  ")}`,
  );
});

test("<KpiRail> primitive owns the rail class and the skeleton gate", () => {
  const src = readFileSync(join(ADMIN_V3, "ui/KpiRail.tsx"), "utf8");
  assert.match(src, /className="av3-kpi-rail"/, "KpiRail must render the .av3-kpi-rail element");
  assert.match(src, /SkeletonKpiRail/, "KpiRail must fall back to SkeletonKpiRail while loading");
});
