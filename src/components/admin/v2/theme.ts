/**
 * Admin v2 design tokens — the canonical source for any value that needs to
 * be consumed in JS (Recharts colors, inline SVGs, etc.). For CSS, use the
 * variables declared on `[data-admin-theme]` in globals.css.
 */

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "sud-admin-theme";
export const THEME_ATTR = "data-admin-theme";

const dark = {
  bg: "#0c0b0e",
  surface1: "#17161c",
  surface2: "#1d1b23",
  surface3: "#262430",
  surfaceHover: "#2f2c39",
  border: "rgba(255, 255, 255, 0.10)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  fg: "#f5f3ee",
  fgMuted: "#c0b9b0",
  fgSubtle: "#978e85",
  brand: "#a62d49",
  platinum: "#cbb48a",
  success: "#2fa875",
  warning: "#d9a441",
  danger: "#e2504b",
  info: "#6e92c0",
  // chart palette — burgundy-led, harmonized + ordered for legibility on dark
  chart: ["#a62d49", "#cbb48a", "#6e92c0", "#2fa875", "#c77f4a", "#8e6fb0", "#d98aa0", "#7fa86b"],
  grid: "rgba(255, 255, 255, 0.08)",
  axis: "#978e85",
} as const;

const light = {
  bg: "#faf7f2",
  surface1: "#ffffff",
  surface2: "#f8f5ef",
  surface3: "#f1ece3",
  surfaceHover: "#ece6db",
  border: "rgba(40, 28, 24, 0.08)",
  borderStrong: "rgba(40, 28, 24, 0.15)",
  fg: "#1c1815",
  fgMuted: "#5a524a",
  fgSubtle: "#877e74",
  brand: "#97283f",
  platinum: "#9c7e4e",
  success: "#1f855e",
  warning: "#b6791c",
  danger: "#cb3b36",
  info: "#3f6493",
  chart: ["#97283f", "#9c7e4e", "#3f6493", "#1f855e", "#b5683a", "#74599a", "#bc6a82", "#5e8049"],
  grid: "rgba(40, 28, 24, 0.08)",
  axis: "#877e74",
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
