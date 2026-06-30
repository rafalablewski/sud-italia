import { createContext, useContext, useMemo, type ReactNode } from "react";
import { PALETTES, RADIUS, SPACING, TYPE, type Palette, type SkinName } from "./tokens";

/**
 * Skin context. Each app shell wraps its tree in a `<ThemeProvider skin=…>`:
 * the customer tabs use the warm `ottaviano` skin, the operator drawer the dark
 * `kds` skin (the always-dark kitchen wall). Components read colours via
 * `useTheme()` so a token change in `tokens.ts` re-skins every screen at once.
 */

export interface Theme {
  skin: SkinName;
  isDark: boolean;
  c: Palette;
  radius: typeof RADIUS;
  spacing: typeof SPACING;
  type: typeof TYPE;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ skin, children }: { skin: SkinName; children: ReactNode }) {
  const value = useMemo<Theme>(
    () => ({
      skin,
      isDark: skin === "kds",
      c: PALETTES[skin],
      radius: RADIUS,
      spacing: SPACING,
      type: TYPE,
    }),
    [skin],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
