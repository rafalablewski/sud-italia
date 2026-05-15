/**
 * Admin v2 design tokens — the canonical source for any value that needs to
 * be consumed in JS (Recharts colors, inline SVGs, etc.). For CSS, use the
 * variables declared on `[data-admin-theme]` in globals.css.
 */

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "sud-admin-theme";
export const THEME_ATTR = "data-admin-theme";

const dark = {
  bg: "#0a0d14",
  surface1: "#11151f",
  surface2: "#161b27",
  surface3: "#1d2330",
  surfaceHover: "#20283a",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  fg: "#f5f7fa",
  fgMuted: "#b6bfcd",
  fgSubtle: "#7d8696",
  brand: "#c8102e",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#6366f1",
  // chart palette — accessible on dark + ordered for legibility
  chart: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"],
  grid: "rgba(255, 255, 255, 0.06)",
  axis: "#7d8696",
} as const;

const light = {
  bg: "#f7f8fa",
  surface1: "#ffffff",
  surface2: "#f9fafb",
  surface3: "#f1f3f7",
  surfaceHover: "#eef0f5",
  border: "rgba(15, 23, 42, 0.07)",
  borderStrong: "rgba(15, 23, 42, 0.14)",
  fg: "#0f172a",
  fgMuted: "#475569",
  fgSubtle: "#6b7480",
  brand: "#c8102e",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#4f46e5",
  chart: ["#4f46e5", "#059669", "#d97706", "#dc2626", "#0891b2", "#9333ea", "#db2777", "#65a30d"],
  grid: "rgba(15, 23, 42, 0.07)",
  axis: "#6b7480",
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
