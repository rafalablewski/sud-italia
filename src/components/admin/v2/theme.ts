/**
 * Admin v2 design tokens — the canonical source for any value that needs to
 * be consumed in JS (Recharts colors, inline SVGs, etc.). For CSS, use the
 * variables declared on `[data-admin-theme]` in globals.css.
 */

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "sud-admin-theme";
export const THEME_ATTR = "data-admin-theme";

const dark = {
  bg: "#2C1810",
  surface1: "#3D2817",
  surface2: "#4A3220",
  surface3: "#5A3F2A",
  surfaceHover: "#6B4A30",
  border: "rgba(248, 239, 222, 0.07)",
  borderStrong: "rgba(248, 239, 222, 0.14)",
  fg: "#F8EFDE",
  fgMuted: "#E0CFA8",
  fgSubtle: "#C9B48E",
  brand: "#B85C38",
  success: "#4A7C59",
  warning: "#C9A23E",
  danger: "#7A2B2B",
  info: "#6B4A30",
  // Tuscany chart palette — terracotta/basil/oxblood/ochre on espresso
  chart: ["#C9A23E", "#4A7C59", "#B85C38", "#A85252", "#E6C97A", "#7FA88B", "#D88E6E", "#9A4A2B"],
  grid: "rgba(248, 239, 222, 0.07)",
  axis: "#C9B48E",
} as const;

const light = {
  bg: "#F8EFDE",
  surface1: "#FBF4E1",
  surface2: "#F2E2C2",
  surface3: "#E8D6B5",
  surfaceHover: "#E0CFA8",
  border: "rgba(61, 40, 23, 0.08)",
  borderStrong: "rgba(61, 40, 23, 0.18)",
  fg: "#2C1810",
  fgMuted: "#6B4A30",
  fgSubtle: "#8C6F4F",
  brand: "#B85C38",
  success: "#4A7C59",
  warning: "#B58B2D",
  danger: "#7A2B2B",
  info: "#6B4A30",
  chart: ["#B85C38", "#4A7C59", "#7A2B2B", "#C9A23E", "#6B4A30", "#9A4A2B", "#355C40", "#A85252"],
  grid: "rgba(61, 40, 23, 0.08)",
  axis: "#8C6F4F",
} as const;

export const palette = { dark, light } as const;

export function getPalette(mode: ThemeMode) {
  return palette[mode];
}

/** Read the current theme without throwing on the server. */
export function readTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  const v = document.documentElement.getAttribute(THEME_ATTR);
  return v === "light" ? "light" : "dark";
}

/** Set theme on <html> and persist to localStorage. */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(THEME_ATTR, mode);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* storage may be blocked — non-fatal */
  }
}

/**
 * Inline script body that runs before hydration to apply the persisted theme
 * without a flash. Stringify and inject in <head>.
 *
 * Dark is the canonical admin design (glassmorphism + brand identity per
 * CLAUDE.md). Light theme exists but is opt-in only: the boot script does
 * NOT honour `prefers-color-scheme` because every operator on a light-mode
 * laptop would otherwise hit the half-finished light surface on first
 * load. Only an explicit `light` in localStorage flips off dark — which
 * means the user clicked the sun toggle deliberately.
 */
export const themeBootScript = `
(function(){try{
  var s=localStorage.getItem('${THEME_STORAGE_KEY}');
  document.documentElement.setAttribute('${THEME_ATTR}',s==='light'?'light':'dark');
}catch(e){document.documentElement.setAttribute('${THEME_ATTR}','dark');}})();
`.trim();
