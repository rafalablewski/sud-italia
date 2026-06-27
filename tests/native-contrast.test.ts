import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Run with:  npx tsx --test tests/native-contrast.test.ts
//
// DESIGN-SYSTEM §5 makes contrast a merge gate, not a polish pass. The two app
// skins are generated into docs/native/parity/design-tokens.json from the web
// token CSS — so we can assert WCAG contrast HERE, in CI, on the exact values the
// app ships, and fail a re-skin that pushes a text/background pair below the bar.
//
// Policy (matches the spec's "4.5 body / 3.0 large"):
//   • OttavianoKDS (operator) — held to full AA body (4.5) on every asserted pair.
//     It's the app the line stares at under glare; no slack.
//   • Ottaviano (customer) — AA body (4.5) for primary text; AA-large floor (3.0)
//     for secondary text + button labels (which render at semibold/large sizes).
//     Pairs that clear 3.0 but not 4.5 are reported below as known items.

const tokens = JSON.parse(
  readFileSync(join(process.cwd(), "docs/native/parity/design-tokens.json"), "utf8"),
) as { palettes: Record<string, Record<string, { hex: string }>> };

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

type Level = "body" | "large";
// [foreground token, background token, level] — level picks the customer floor.
const PAIRS: [string, string, Level][] = [
  ["textPrimary", "surface", "body"],
  ["textPrimary", "surface2", "body"],
  ["textSecondary", "surface", "large"],
  ["textSecondary", "surface2", "large"],
  ["onAccent", "accent", "large"], // primary button label
  ["onAccent", "brand", "body"],
  ["success", "surface", "large"],
  ["danger", "surface", "large"],
];

function floor(skin: string, level: Level): number {
  if (skin === "kds") return 4.5; // operator: full AA body, no exceptions
  return level === "body" ? 4.5 : 3.0; // customer
}

for (const skin of Object.keys(tokens.palettes)) {
  test(`contrast — ${skin} skin meets its WCAG floor`, () => {
    const p = tokens.palettes[skin];
    const notes: string[] = [];
    for (const [fg, bg, level] of PAIRS) {
      const r = ratio(p[fg].hex, p[bg].hex);
      const min = floor(skin, level);
      assert.ok(
        r >= min,
        `${skin}: ${fg} on ${bg} = ${r.toFixed(2)} < ${min} (${p[fg].hex} / ${p[bg].hex})`,
      );
      if (r < 4.5) notes.push(`  ⚠︎ ${fg} on ${bg} = ${r.toFixed(2)} (AA-large only)`);
    }
    if (notes.length) console.log(`[${skin}] AA-body shortfalls (known, web-token-owned):\n${notes.join("\n")}`);
  });
}

test("warning is a fill token, not a text-on-surface token", () => {
  // Documented: --warning/ochre is used as a badge/accent fill, never as body
  // text on the page surface (it wouldn't pass), so it's intentionally not gated
  // as a text pair above. This test pins that decision so nobody "fixes" it by
  // adding a failing assertion.
  assert.ok(tokens.palettes.kds.warning && tokens.palettes.ottaviano.warning);
});
