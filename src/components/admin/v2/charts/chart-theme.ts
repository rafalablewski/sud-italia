"use client";

import { useEffect, useState } from "react";
import { getPalette, readTheme, THEME_ATTR, type ThemeMode } from "@/shared/theme";

/**
 * Subscribes to admin theme changes so chart wrappers can rerender with
 * correct grid/axis/series colors. Returns the live ThemeMode + palette.
 */
export function useChartTheme() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  useEffect(() => {
    setMode(readTheme());
    const obs = new MutationObserver(() => setMode(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTR] });
    return () => obs.disconnect();
  }, []);
  return { mode, palette: getPalette(mode) };
}
