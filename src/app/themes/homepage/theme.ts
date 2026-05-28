/**
 * Homepage theme — JS-side token mirror.
 *
 * The canonical values live in `themes/homepage/tokens.css` (the
 * Tailwind v4 `@theme inline` block). This file mirrors them as typed
 * TypeScript constants for any code that can't read CSS variables:
 * Recharts colour arrays on a storefront analytics widget, an inline
 * `<svg fill="…">` on a hero illustration, a `<canvas>`-backed
 * loyalty-tier visualisation, etc.
 *
 * **There are no consumers today** — every storefront surface reads
 * tokens via Tailwind utilities (`bg-italia-red` / `text-italia-cream`
 * / etc.) or via CSS variables directly. This file exists as a
 * structural mirror of the admin pattern
 * (`src/components/admin/v2/theme.ts`): future storefront code that
 * needs JS access should import from here rather than hardcode hex
 * values.
 *
 * Editing rule: if a value here drifts from the matching
 * `--color-italia-*` declaration in `themes/homepage/tokens.css`, the
 * CSS wins (every storefront utility class compiles from it). Keep
 * this file in sync; a divergence is a bug.
 */

export const homepage = {
  // Surfaces
  background: "#FFF8F0", // warm cream — italian café paper
  foreground: "#1A1A1A", // near-black, never pure #000
  // Brand
  italiaRed: "#9A2742", // burgundy / oxblood — brand + danger (the one red)
  italiaRedDark: "#7B1F33",
  italiaGreen: "#008C45", // status: open / active / out for delivery
  italiaGreenDark: "#006B35",
  italiaCream: "#FFF8F0", // soft fill (same as background, semantic alias)
  italiaCreamDark: "#F5EDDF", // alternating sections, hover on cream cards
  italiaGold: "#B8922E", // editorial accent — Fraunces pull-quote, Chef's pick, Gold tier
  italiaGoldDark: "#9A7A24",
  italiaDark: "#1A1A1A", // semantic alias for foreground on heading copy
  italiaGray: "#6B7280", // secondary text, captions
  italiaLightGray: "#F3F4F6", // disabled state, inactive form border
} as const;

export type HomepageToken = keyof typeof homepage;
