/**
 * Theme-skin registry — the one place that knows which skins exist for each
 * surface. Pure data + helpers, ZERO server/node imports, so it is safe to
 * import from both server code (layouts, store, API routes) and "use client"
 * components (the Settings skin picker, the storefront skin sync).
 *
 * A "skin" is a totally distinct theme for a surface: its own CSS file, its
 * own selector namespace (scoped under `[data-skin="<id>"]`), its own tokens.
 * Swapping a skin is DB-global (operator picks it in /admin/settings → Themes)
 * and applies to every visitor. The active id is persisted by the store
 * (`getThemeSkinSettings`/`updateThemeSkinSettings`) and rendered onto the
 * surface root as `data-skin`.
 *
 * The default skin for every surface is the existing theme — its CSS is
 * already loaded by the layout and is NOT scoped under `[data-skin]`, so
 * `data-skin="default"` is simply "leave the base theme as-is". Each non-
 * default skin ships a self-contained stylesheet under
 * `src/app/themes/<theme>/skins/<id>.css` (documented in
 * docs/design-system/<theme>/skins.md per CLAUDE.md Rule #11).
 */

export type ThemeSurface = "homepage" | "admin" | "core";

export interface ThemeSkin {
  /** Stable id — also the value of `data-skin` and the CSS filename. */
  id: string;
  /** Operator-facing name shown in the Settings picker. */
  label: string;
  /** One line describing the look, shown under the label. */
  description: string;
}

export const THEME_SURFACES: ThemeSurface[] = ["homepage", "admin", "core"];

/** Human label for each surface (Settings picker headings). */
export const SURFACE_LABELS: Record<ThemeSurface, string> = {
  homepage: "Business (storefront)",
  admin: "Admin",
  core: "Core",
};

/**
 * Available skins per surface. The first entry is always the `default`
 * (the surface's shipped theme); the rest are alternate skins.
 */
export const THEME_SKINS: Record<ThemeSurface, ThemeSkin[]> = {
  homepage: [
    {
      id: "default",
      label: "Trattoria",
      description: "The shipped V8 Trattoria storefront — warm parchment canvas, oxblood brand, editorial serif.",
    },
    {
      id: "notte",
      label: "Notte",
      description: "A candle-lit night skin — deep espresso canvas, warm cream ink, ochre + terracotta glow.",
    },
  ],
  admin: [
    {
      id: "default",
      label: "Operator Terminal",
      description: "The shipped Admin v3 — density-first warm-neutral dark cockpit with a Neapolitan burgundy accent.",
    },
    {
      id: "blueprint",
      label: "Blueprint",
      description: "A cool technical skin — deep navy canvas, cyan brand, drafting-table hairlines.",
    },
  ],
  core: [
    {
      id: "default",
      label: "Core Dark",
      description: "The shipped Core theme — near-black flat materials for night trucks and kitchen glare.",
    },
    {
      id: "solare",
      label: "Solare",
      description: "A warm daylight skin — sun-bleached parchment surfaces and terracotta brand for bright service.",
    },
  ],
};

/** The default skin id for every surface — always "default". */
export const DEFAULT_THEME_SKINS: Record<ThemeSurface, string> = {
  homepage: "default",
  admin: "default",
  core: "default",
};

/** True when `id` is a known skin for `surface`. */
export function isValidSkin(surface: ThemeSurface, id: string | undefined | null): boolean {
  if (!id) return false;
  return THEME_SKINS[surface].some((s) => s.id === id);
}

/**
 * Coerce a (possibly stale / unknown) id to a valid one for the surface,
 * falling back to the surface default. Used on every read + write so a
 * deleted skin can never leave a surface pointing at a missing stylesheet.
 */
export function resolveSkin(surface: ThemeSurface, id: string | undefined | null): string {
  return isValidSkin(surface, id) ? (id as string) : DEFAULT_THEME_SKINS[surface];
}

/** Settings shape persisted by the store + returned by the themes API. */
export type ThemeSkinSettings = Record<ThemeSurface, string>;

/** Coerce a partial/raw object into a fully-resolved settings record. */
export function resolveSkinSettings(raw: Partial<ThemeSkinSettings> | undefined | null): ThemeSkinSettings {
  return {
    homepage: resolveSkin("homepage", raw?.homepage),
    admin: resolveSkin("admin", raw?.admin),
    core: resolveSkin("core", raw?.core),
  };
}
