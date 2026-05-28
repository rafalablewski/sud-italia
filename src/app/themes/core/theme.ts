/**
 * Core theme — JS-side token mirror.
 *
 * The canonical values live in src/app/themes/core/index.css (the
 * `--cmd-*` palette declared at `:root`). This file mirrors them as
 * typed TypeScript constants for any code that can't read CSS
 * variables: Recharts colour arrays on a KDS analytics overlay, an
 * inline `<svg fill="…">` on a POS receipt, a `<canvas>` micro-chart
 * on the Concierge surface, etc.
 *
 * **There are no consumers today** — every Core surface in the
 * codebase reads tokens via CSS. This file exists as a structural
 * mirror of the admin pattern (`src/components/admin/v2/theme.ts`):
 * future Core code that needs JS access should import from here
 * rather than hardcode hex values.
 *
 * Editing rule: if a value here drifts from the matching `--cmd-*`
 * declaration in `themes/core/index.css`, the CSS wins (it's what
 * every Core component actually paints from). Keep this file in sync;
 * a divergence is a bug.
 */

export const core = {
  // Surfaces — see themes/core/index.css :root
  canvas: "#0a0a0c",
  panel: "#141318",
  raised: "#222028",
  hair: "rgba(255, 255, 255, 0.08)",
  hairStrong: "rgba(255, 255, 255, 0.16)",
  // Text
  text: "#f1efe9",
  dim: "#b6afa6",
  faint: "#918880",
  // Status hues (operational meaning, never decoration)
  queued: "#6a655f",
  firing: "#4d90e8",
  warn: "#e0a93f",
  late: "#e5484d",
  ready: "#3dd68c",
  risk: "#9a72e0",
  // Soft fills for status backgrounds
  firingSoft: "rgba(77, 144, 232, 0.14)",
  warnSoft: "rgba(224, 169, 63, 0.14)",
  lateSoft: "rgba(229, 72, 77, 0.14)",
  readySoft: "rgba(61, 214, 140, 0.13)",
  riskSoft: "rgba(154, 114, 224, 0.16)",
  // Platinum jewellery accent — hairlines, key numerals only
  platinum: "#cbb48a",
} as const;

export type CoreToken = keyof typeof core;
