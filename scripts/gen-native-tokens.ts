/**
 * Native design tokens — parity generator + drift gate.
 *
 *   npm run gen:native        → (re)write the generated token artifacts
 *   npm run check:native      → fail (exit 1) if the committed tokens drift
 *
 * THE PROBLEM THIS SOLVES
 * The two app skins (`Theme.ottaviano`, `Theme.kds`) were hand-transcribed hexes
 * that had already drifted from the web (`Theme.kds` used #0B0F16 / ochre while
 * the web Core skin is #100f12 / brand-red #d23a55). We make the web token CSS
 * the source of truth and GENERATE the RN palettes, with per-field provenance,
 * so a web re-skin propagates and CI fails on divergence. (Originally emitted a
 * Swift palette for the retired SwiftUI seed; now emits TypeScript for the bare-RN
 * app — see docs/native/README.md "Stack change".)
 *
 * SOURCES OF TRUTH
 *  - src/app/themes/homepage/tokens.css  → the customer (Ottaviano) skin
 *  - src/app/themes/core/tokens.css      → the operator (OttavianoKDS) skin (dark)
 *
 * OUTPUTS (generated — never hand-edit)
 *  - docs/native/parity/design-tokens.json
 *  - native/ottaviano-rn/src/theme/tokens.generated.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const PARITY_DIR = join(ROOT, "docs/native/parity");
const HOMEPAGE_CSS = join(ROOT, "src/app/themes/homepage/tokens.css");
const CORE_CSS = join(ROOT, "src/app/themes/core/tokens.css");
const JSON_OUT = join(PARITY_DIR, "design-tokens.json");
const TS_OUT = join(
  ROOT,
  "native/ottaviano-rn/src/theme/tokens.generated.ts",
);
// Swift skin for the OttavianoKDS app (native/ottaviano-ios). "We build only
// SwiftUI" — the operator app is SwiftUI, so the same web token CSS that feeds
// the RN skin also generates the Swift palette, from the same provenance, so the
// two consumers can't drift from the web or from each other.
const SWIFT_OUT = join(
  ROOT,
  "native/ottaviano-ios/Sources/DesignSystem/Tokens.generated.swift",
);
const CHECK = process.argv.includes("--check");

// ── tiny CSS-var reader ───────────────────────────────────────────────────────
/** Body of the first `{ … }` that follows a selector substring. */
function blockAfter(css: string, selectorSnippet: string): string {
  const at = css.indexOf(selectorSnippet);
  if (at < 0) return "";
  const open = css.indexOf("{", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return "";
}
function parseVars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g))
    out[m[1]] = m[2].trim();
  return out;
}

const homepageVars = parseVars(blockAfter(readFileSync(HOMEPAGE_CSS, "utf-8"), "@theme inline"));
const coreText = readFileSync(CORE_CSS, "utf-8");
// Core dark = mode-independent `.core {` block + the dark override block.
const coreVars = {
  ...parseVars(blockAfter(coreText, ".core {")),
  ...parseVars(blockAfter(coreText, '.core[data-theme="dark"]')),
};
const VARS: Record<"homepage" | "core", Record<string, string>> = {
  homepage: homepageVars,
  core: coreVars,
};

// ── colour normalisation ──────────────────────────────────────────────────────
type RGB = [number, number, number];
function hexToRGB(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
/** Flatten `rgba(r,g,b,a)` over an opaque background → solid hex (hairlines). */
function flattenOver(rgba: string, bg: RGB): string {
  const m = rgba.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (!m) return rgba;
  const fg: RGB = [Number(m[1]), Number(m[2]), Number(m[3])];
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return rgbToHex([0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as RGB);
}

interface FieldSpec {
  css: "homepage" | "core";
  var: string;
  /** When the var is an rgba hairline, flatten it over this same-skin var's colour. */
  flattenOver?: string;
  note?: string;
}
// Palette field order MUST match Theme.Palette's memberwise init.
const FIELD_ORDER = [
  "accent", "onAccent", "brand", "surface", "surface2", "line",
  "textPrimary", "textSecondary", "success", "warning", "danger",
] as const;

const OTTAVIANO: Record<string, FieldSpec> = {
  accent: { css: "homepage", var: "color-terracotta" },
  onAccent: { css: "homepage", var: "color-parchment" },
  brand: { css: "homepage", var: "color-oxblood" },
  surface: { css: "homepage", var: "color-background" },
  surface2: { css: "homepage", var: "color-parchment-deep" },
  line: { css: "homepage", var: "color-line-soft" },
  textPrimary: { css: "homepage", var: "color-ink" },
  textSecondary: { css: "homepage", var: "color-muted" },
  success: { css: "homepage", var: "color-basil" },
  warning: { css: "homepage", var: "color-ochre" },
  danger: { css: "homepage", var: "color-italy-red", note: "homepage defines no semantic danger; the flag red is the nearest web-sourced red" },
};
const KDS: Record<string, FieldSpec> = {
  accent: { css: "core", var: "brand", note: "web Core primary brand — replaces the pre-parity ochre accent" },
  onAccent: { css: "core", var: "on-accent" },
  brand: { css: "core", var: "brand" },
  surface: { css: "core", var: "bg" },
  surface2: { css: "core", var: "panel" },
  line: { css: "core", var: "line-2", flattenOver: "bg", note: "rgba hairline flattened over --bg → solid" },
  textPrimary: { css: "core", var: "ink" },
  textSecondary: { css: "core", var: "ink-2" },
  success: { css: "core", var: "basil" },
  warning: { css: "core", var: "amber" },
  danger: { css: "core", var: "danger" },
};

const errors: string[] = [];
function resolve(spec: FieldSpec): { hex: string; source: string } {
  const raw = VARS[spec.css][spec.var];
  if (raw === undefined) {
    errors.push(`token var --${spec.var} not found in ${spec.css} tokens.css`);
    return { hex: "#000000", source: `MISSING ${spec.css} --${spec.var}` };
  }
  let hex: string;
  if (raw.startsWith("rgba") || raw.startsWith("rgb(")) {
    const bgVar = spec.flattenOver ? VARS[spec.css][spec.flattenOver] : undefined;
    if (!bgVar) {
      errors.push(`--${spec.var} is rgba but no flattenOver background given`);
      hex = "#000000";
    } else hex = flattenOver(raw, hexToRGB(bgVar));
  } else {
    hex = rgbToHex(hexToRGB(raw));
  }
  const src = `${spec.css} --${spec.var}` + (spec.note ? ` (${spec.note})` : "");
  return { hex, source: src };
}

function buildPalette(map: Record<string, FieldSpec>) {
  const fields: Record<string, { hex: string; source: string }> = {};
  for (const f of FIELD_ORDER) fields[f] = resolve(map[f]);
  return fields;
}
const ottavianoPalette = buildPalette(OTTAVIANO);
const kdsPalette = buildPalette(KDS);

// Corner radius: customer is a native structural choice (no web token); operator
// pulls the web Core --r-lg so cards round identically to the web Core surfaces.
const kdsRadius = parseInt((coreVars["r-lg"] ?? "14px").replace("px", ""), 10);
const ottavianoRadius = 16;

// Shared radius scale — radius is not brand-specific (DESIGN-SYSTEM §2.3), so one
// scale drives both skins. Pulled from the web Core --r-* tokens so a card/pill
// rounds identically to the web.
const px = (v: string | undefined, fallback: number) =>
  v ? parseInt(v.replace("px", ""), 10) : fallback;
const radius = {
  sm: px(coreVars["r-sm"], 7),
  md: px(coreVars["r-md"], 10),
  lg: px(coreVars["r-lg"], 14),
  xl: px(coreVars["r-xl"], 20),
  pill: px(coreVars["pill"], 999),
};

const tokensJson = {
  _generated:
    "Auto-generated by scripts/gen-native-tokens.ts — do not edit. Edit src/app/themes/{homepage,core}/tokens.css, then run `npm run gen:native`.",
  palettes: {
    ottaviano: { ...ottavianoPalette, cornerRadius: ottavianoRadius },
    kds: { ...kdsPalette, cornerRadius: kdsRadius },
  },
  radius,
};

// ── emit TypeScript (React Native skin tokens) ───────────────────────────────
function paletteTS(name: string, p: Record<string, { hex: string; source: string }>, corner: number): string {
  const line = (f: string) => `    ${f}: "${p[f].hex}",`.padEnd(28) + ` // ${p[f].source}`;
  return (
    `  // ${name} skin — generated from the web token CSS (provenance per line).\n` +
    `  ${name}: {\n` +
    FIELD_ORDER.map(line).join("\n") +
    `\n    cornerRadius: ${corner},\n  },`
  );
}
const ts = `// @generated by scripts/gen-native-tokens.ts — DO NOT EDIT.
// Native skins generated from the web token CSS so the two app skins cannot drift:
//   Ottaviano (customer) ← src/app/themes/homepage/tokens.css
//   OttavianoKDS (operator) ← src/app/themes/core/tokens.css (dark)
// Regenerate: \`npm run gen:native\`. CI fails on drift: \`npm run check:native\`.
// src/theme/tokens.ts consumes these and layers the semantic scale (spacing, type).

export const PALETTES = {
${paletteTS("ottaviano", ottavianoPalette, ottavianoRadius)}

${paletteTS("kds", kdsPalette, kdsRadius)}
} as const;

// Shared radius scale — web Core --r-* (radius is not brand-specific).
export const RADIUS = {
  sm: ${radius.sm},
  md: ${radius.md},
  lg: ${radius.lg},
  xl: ${radius.xl},
  pill: ${radius.pill},
} as const;
`;

// ── emit Swift (OttavianoKDS skin tokens) ────────────────────────────────────
// `GeneratedTokens` in native/ottaviano-ios — consumed by Theme.swift
// (Theme.ottaviano / Theme.kds). Same palettes as the RN skin, same provenance.
function hexLiteral(hex: string): string {
  return "0x" + hex.replace("#", "").toUpperCase();
}
function paletteSwift(name: string, p: Record<string, { hex: string; source: string }>): string {
  const line = (f: string) =>
    `        ${f}: Color(hex: ${hexLiteral(p[f].hex)}),`.padEnd(44) + ` // ${p[f].source}`;
  return (
    `    /// ${name} skin — generated from the web token CSS (see provenance per line).\n` +
    `    public static let ${name} = Theme.Palette(\n` +
    FIELD_ORDER.map(line).join("\n") +
    `\n    )`
  );
}
const swift = `import SwiftUI

// @generated by scripts/gen-native-tokens.ts — DO NOT EDIT.
// Palettes generated from the web token CSS so the app skins cannot drift:
//   Ottaviano (customer) ← src/app/themes/homepage/tokens.css
//   OttavianoKDS (operator) ← src/app/themes/core/tokens.css (dark)
// Regenerate: \`npm run gen:native\`. CI fails on drift: \`npm run check:native\`.
// Theme.ottaviano / Theme.kds consume these; Color(hex:) lives in Theme.swift.

public enum GeneratedTokens {
${paletteSwift("ottaviano", ottavianoPalette)}

${paletteSwift("kds", kdsPalette)}

    public static let ottavianoCornerRadius: CGFloat = ${ottavianoRadius}
    public static let kdsCornerRadius: CGFloat = ${kdsRadius}

    // Shared radius scale — web Core --r-* (radius is not brand-specific).
    public static let radiusSM: CGFloat = ${radius.sm}    // core --r-sm
    public static let radiusMD: CGFloat = ${radius.md}   // core --r-md
    public static let radiusLG: CGFloat = ${radius.lg}   // core --r-lg
    public static let radiusXL: CGFloat = ${radius.xl}   // core --r-xl
    public static let radiusPill: CGFloat = ${radius.pill} // core --pill
}
`;

if (errors.length) {
  console.error("✗ native token parity errors:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

const outputs = [
  { path: JSON_OUT, content: JSON.stringify(tokensJson, null, 2) + "\n" },
  { path: TS_OUT, content: ts },
  { path: SWIFT_OUT, content: swift },
];
if (CHECK) {
  let drift = false;
  for (const { path, content } of outputs) {
    const cur = existsSync(path) ? readFileSync(path, "utf-8") : "";
    if (cur !== content) {
      drift = true;
      console.error(`✗ stale: ${path.replace(ROOT + "/", "")} — run \`npm run gen:native\``);
    }
  }
  if (drift) process.exit(1);
  console.log("✓ native design tokens in sync — 2 skins, 11 fields each");
} else {
  mkdirSync(PARITY_DIR, { recursive: true });
  for (const { path, content } of outputs) writeFileSync(path, content, "utf-8");
  console.log(
    `✓ gen-native-tokens — ottaviano(${ottavianoPalette.accent.hex}) + kds(${kdsPalette.accent.hex}) skins, radii ${ottavianoRadius}/${kdsRadius}`,
  );
}
