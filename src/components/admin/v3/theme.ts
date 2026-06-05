/**
 * Admin v3 design tokens — the canonical JS mirror of the `--av3-*` custom
 * properties declared on `.av3-root` in `src/app/themes/admin-v3/index.css`.
 * Consume this from charts / inline SVG / any JS that needs a colour; for CSS,
 * use the `var(--av3-*)` tokens directly. Never hardcode a hex in a component.
 *
 * v3 is isolated from v2 so v2 can be deleted cleanly — this file owns its own
 * boot script and palette and imports nothing from `components/admin/v2/`.
 */

export type ThemeMode = "light" | "dark";

// v3 reads the SAME attribute v2's boot writes (so the toggle is shared and
// dark/light persists across a v2→v3 cutover), but ships its own copies of the
// key + attr + boot so deleting v2 leaves v3 fully functional.
export const THEME_STORAGE_KEY = "sud-admin-theme";
export const THEME_ATTR = "data-admin-theme";

const dark = {
  bg: "#0a0a0c",
  s1: "#141417",
  s2: "#1b1b1f",
  s3: "#24242a",
  hover: "#2c2c33",
  line: "rgba(255,255,255,0.07)",
  lineStrong: "rgba(255,255,255,0.13)",
  fg: "#f4f3f1",
  muted: "#a6a099",
  subtle: "#6e6862",
  brand: "#c2384f",
  platinum: "#cbb48a",
  ok: "#34b27b",
  warn: "#e0a93f",
  bad: "#e8554f",
  info: "#5f9bd6",
  // chart palette — burgundy-led, ordered for legibility on the deep canvas
  chart: ["#c2384f", "#cbb48a", "#5f9bd6", "#34b27b", "#d3884f", "#9b7ec0", "#e08aa2", "#80ac6e"],
  grid: "rgba(255,255,255,0.06)",
  axis: "#6e6862",
} as const;

const light = {
  bg: "#f7f5f1",
  s1: "#ffffff",
  s2: "#f6f3ee",
  s3: "#efebe3",
  hover: "#e9e4da",
  line: "rgba(28,24,21,0.09)",
  lineStrong: "rgba(28,24,21,0.16)",
  fg: "#1a1714",
  muted: "#57504a",
  subtle: "#857c73",
  brand: "#a82940",
  platinum: "#9c7e4e",
  ok: "#1f8a60",
  warn: "#b5781d",
  bad: "#cc3a35",
  info: "#3d6694",
  chart: ["#a82940", "#9c7e4e", "#3d6694", "#1f8a60", "#b56a3b", "#74599a", "#bc6a82", "#5e8049"],
  grid: "rgba(28,24,21,0.08)",
  axis: "#857c73",
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
 * Inline script that runs before hydration to apply the persisted theme with
 * no flash. Dark is canonical; light is opt-in only (we don't honour
 * prefers-color-scheme so a light-laptop operator doesn't land on light by
 * accident). Stringify + inject in the v3 layout head.
 */
export const themeBootScriptV3 = `
(function(){try{
  var s=localStorage.getItem('${THEME_STORAGE_KEY}');
  document.documentElement.setAttribute('${THEME_ATTR}',s==='light'?'light':'dark');
}catch(e){document.documentElement.setAttribute('${THEME_ATTR}','dark');}})();
`.trim();
