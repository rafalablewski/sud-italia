import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Run with:  npx tsx --test tests/native-parity.test.ts
//
// The OttavianoKDS app must stay 1:1 with the web operator IA and theme. We
// generate the native nav + design tokens FROM the web (nav.config.ts,
// CORE_SURFACES, themes/*/tokens.css) — these tests fail the PR if the committed
// generated artifacts drift from a fresh generation, the same drift-guard the
// committed openapi.json gets. Fix: `npm run gen:native`.

function check(script: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", join("scripts", script), "--check"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

test("native nav is in sync with the web operator IA (run `npm run gen:native`)", () => {
  const { ok, out } = check("gen-native-nav.ts");
  assert.ok(ok, out);
});

test("native design tokens are in sync with the web token CSS (run `npm run gen:native`)", () => {
  const { ok, out } = check("gen-native-tokens.ts");
  assert.ok(ok, out);
});

test("every web operator surface has a native presentation (no missing / no stale)", () => {
  // The manifest is the merged source of truth; assert the headline counts the
  // README quotes ("52 of 54 live") so a silent surface add/remove trips here too.
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "docs/native/parity/operator-nav.manifest.json"), "utf8"),
  ) as { counts: { surfaces: number; live: number; scaffold: number }; sections: unknown[] };
  assert.equal(manifest.counts.surfaces, manifest.counts.live + manifest.counts.scaffold);
  assert.ok(manifest.counts.surfaces >= 54, "operator surface count dropped below 54");
  assert.ok(Array.isArray(manifest.sections) && manifest.sections.length >= 10);
});
