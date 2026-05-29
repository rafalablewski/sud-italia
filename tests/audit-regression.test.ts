// Regression guard for the hardcoded-values audit (see
// tests/audit-hardcoded.md). Each test below pins one of the
// silent-drift patterns we fixed across Phases 1–8; re-introducing
// the same shape in a future commit will fail this test.
//
// Run via `npm test`. The tests grep `src/` only — the tracker file
// and this file deliberately mention the forbidden patterns (to
// document them) and would self-trigger if included.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

function rg(pattern: string, opts: { exclude?: string[] } = {}): string[] {
  const excludes = (opts.exclude ?? [])
    .map((e) => `--glob '!${e}'`)
    .join(" ");
  try {
    const out = execSync(
      `rg -n ${excludes} ${JSON.stringify(pattern)} src 2>/dev/null || true`,
      { encoding: "utf8" },
    );
    return out
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fail(hits: string[], msg: string): never {
  assert.fail(`${msg}\n${hits.join("\n")}`);
}

// ---- Menu ---------------------------------------------------------------

test("no direct seed-menu imports outside src/data/menus/", () => {
  const hits = rg(`from\\s+["']@/data/menus/(krakow|warszawa)["']`, {
    exclude: ["src/data/menus/**"],
  });
  if (hits.length > 0) {
    fail(hits, "Use getMenu(slug) / getMenuWithOverrides(slug) from @/data/menus instead.");
  }
});

// ---- Locations ----------------------------------------------------------

test("no hardcoded slug literal lists outside src/data/locations.ts", () => {
  const hits = rg(`\\b(ACTIVE_LOCATIONS|TRUCK_SLUGS|KNOWN_LOCATIONS)\\s*=\\s*\\[`, {
    exclude: ["src/data/locations.ts"],
  });
  if (hits.length > 0) {
    fail(
      hits,
      "Hardcoded slug array. Use getActiveLocations() (client) or getActiveLocationsAsync() (server).",
    );
  }
});

test("no hardcoded {key/value/slug: 'krakow' | 'warszawa'} option arrays in admin", () => {
  // Captures the dropdown shape we cleaned up in Phase 3c.
  const hits = rg(
    `\\{\\s*(key|value|slug)\\s*:\\s*["']krakow["']\\s*,\\s*(label|name)\\s*:`,
  );
  if (hits.length > 0) {
    fail(hits, "Derive dropdowns from getActiveLocations().");
  }
});

// ---- Loyalty ------------------------------------------------------------

test("no top-level loyalty-config consts shadowing settings", () => {
  // Phase 4 + 8a deleted these. Anyone re-declaring them is rebuilding
  // the silent-drift bug.
  const banned = ["TIER_CONFIG", "TIER_THRESHOLDS", "REFERRAL_REWARD", "SPEED_GUARANTEE"];
  const hits = rg(
    `^export\\s+const\\s+(${banned.join("|")})\\b`,
  );
  if (hits.length > 0) {
    fail(
      hits,
      "These shapes live on LoyaltySettings. Read via getLoyaltySettings() or /api/settings/public.",
    );
  }
});

test("no top-level REWARDS array export from lib/", () => {
  // Distinct from the LoyaltySettings.rewards field — that's a settings
  // shape, not a top-level const.
  const hits = rg(
    `^export\\s+const\\s+REWARDS\\b`,
  );
  if (hits.length > 0) {
    fail(hits, "Edit rewards in /admin/growth → Rewards; read via getLoyaltySettings().rewards.");
  }
});

// ---- Contact / branding -------------------------------------------------

test("no hardcoded contact-email / phone consts in constants module", () => {
  const banned = ["CONTACT_EMAIL", "CONTACT_PHONE", "SOCIAL_LINKS"];
  const hits = rg(`^export\\s+const\\s+(${banned.join("|")})\\b`);
  if (hits.length > 0) {
    fail(
      hits,
      "Edit at /admin/settings → General. Read via getSettings() or /api/settings/public.",
    );
  }
});

// ---- Pricing ------------------------------------------------------------

test("no top-level DELIVERY_FEE_GROSZE re-export from outside lib/upsell.ts", () => {
  // The const is kept inside lib/upsell.ts as the first-deploy fallback.
  // Re-exporting / duplicating it elsewhere is the audit pattern we
  // already fixed once.
  const hits = rg(
    `^export\\s+const\\s+DELIVERY_FEE_GROSZE\\b`,
    { exclude: ["src/lib/upsell.ts"] },
  );
  if (hits.length > 0) {
    fail(hits, "Use AppSettings.deliveryFee + computeDeliveryFee(..., feeOverride).");
  }
});

test("no top-level VAT_RATE const — VAT comes from compliance settings", () => {
  const hits = rg(`^(export\\s+)?const\\s+VAT_RATE\\s*=`);
  if (hits.length > 0) {
    fail(
      hits,
      "VAT lives on LocationComplianceConfig.vatRateBps. Resolve via resolveLocationCompliance().",
    );
  }
});

// ---- Fixtures -----------------------------------------------------------

test("no MOCK_ / FAKE_ / DEMO_ data structures", () => {
  // Rule #1 explicitly bans this. The audit found it in past commits;
  // pinning the rule mechanically.
  const hits = rg(`(MOCK_|FAKE_|DEMO_|SAMPLE_DATA|EARNED_IDS\\b)`);
  if (hits.length > 0) {
    fail(
      hits,
      "Rule #1: no mock / fake / demo data. Wire to a real store API.",
    );
  }
});
