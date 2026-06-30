/**
 * Native design tokens — the two app skins + the semantic scale on top.
 *
 * SOURCE OF TRUTH: the palettes (`PALETTES`) and radius scale (`RADIUS`) are
 * GENERATED into `./tokens.generated.ts` from the web token CSS
 * (`src/app/themes/{homepage,core}/tokens.css`) by `scripts/gen-native-tokens.ts`
 * — a web re-skin propagates here and CI's `npm run check:native` fails on drift
 * (CLAUDE.md Rule #11 / the native parity gate). Never hand-edit the hexes; this
 * file only layers spacing + type, which have no web-CSS equivalent. The
 * `ottaviano` skin dresses the customer app (warm parchment); the `kds` skin
 * dresses the operator app (always-dark kitchen wall).
 */

export { PALETTES, RADIUS } from "./tokens.generated";
import { PALETTES } from "./tokens.generated";

export interface Palette {
  accent: string;
  onAccent: string;
  brand: string;
  surface: string;
  surface2: string;
  line: string;
  textPrimary: string;
  textSecondary: string;
  success: string;
  warning: string;
  danger: string;
  cornerRadius: number;
}

export type SkinName = keyof typeof PALETTES;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const TYPE = {
  display: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: "700" as const, letterSpacing: -0.2 },
  heading: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "500" as const },
  label: { fontSize: 13, fontWeight: "600" as const },
  mono: { fontVariant: ["tabular-nums" as const] },
};
