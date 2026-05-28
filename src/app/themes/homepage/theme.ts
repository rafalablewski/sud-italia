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
 * Palette: V8 Trattoria — parchment, terracotta, basil, oxblood, ochre,
 * espresso. The `italia-*` keys are kept as semantic aliases (788 use
 * sites across the codebase) and remapped to V8 equivalents; the V8-named
 * keys (`parchment`, `terracotta`, `basil`, `oxblood`, `ochre`, `espresso`)
 * are the natural reach for new V8 components.
 *
 * Editing rule: if a value here drifts from the matching
 * `--color-*` declaration in `themes/homepage/tokens.css`, the CSS
 * wins (every storefront utility class compiles from it). Keep this
 * file in sync; a divergence is a bug.
 */

export const homepage = {
  // Surfaces
  background: "#F8EFDE", // parchment — warm Tuscan paper, the page canvas
  foreground: "#2C1810", // ink — near-black with a brown bias
  // Italia-* semantic aliases (remapped to Tuscany values)
  italiaRed: "#7A2B2B", // oxblood — brand burgundy + danger
  italiaRedDark: "#5A1F1F",
  italiaGreen: "#4A7C59", // basil — open / active / out for delivery
  italiaGreenDark: "#355C40",
  italiaCream: "#F8EFDE", // parchment (semantic alias for background)
  italiaCreamDark: "#F2E2C2", // parchment-deep — alternating sections
  italiaGold: "#C9A23E", // ochre — editorial accent, Gold tier
  italiaGoldDark: "#9A7A24",
  italiaDark: "#2C1810", // ink — heading copy
  italiaGray: "#8C6F4F", // muted — secondary text, captions
  italiaLightGray: "#E0CFA8", // line-soft — disabled / inactive border
  // V8-named tokens (reach for these in new V8 components)
  parchment: "#F8EFDE",
  parchmentDeep: "#F2E2C2",
  paperShadow: "#E8D6B5",
  terracotta: "#B85C38", // V8 primary action accent
  terracottaDark: "#9A4A2B",
  terracottaSoft: "#D88E6E",
  basil: "#4A7C59",
  basilDeep: "#355C40",
  oxblood: "#7A2B2B",
  oxbloodSoft: "#A85252",
  ochre: "#C9A23E",
  ochreLight: "#E6C97A",
  espresso: "#3D2817",
  espressoSoft: "#6B4A30",
  ink: "#2C1810",
  muted: "#8C6F4F",
  line: "#C9B48E",
  lineSoft: "#E0CFA8",
  // Italian flag (Famiglia strip + Made-in-Italy badges)
  italyGreen: "#008C45",
  italyWhite: "#F4F5F0",
  italyRed: "#CD212A",
} as const;

export type HomepageToken = keyof typeof homepage;
