"use client";

import { useCallback, useEffect, useState } from "react";
import { applyTheme, readTheme, THEME_ATTR, type ThemeMode } from "@/shared/theme";

/**
 * Reads/sets the admin theme. The boot script in admin/layout.tsx applies the
 * initial value before hydration, so we just sync React state from the DOM on
 * mount and observe attribute changes from other tabs.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    setMode(readTheme());
    const observer = new MutationObserver(() => setMode(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [THEME_ATTR],
    });
    return () => observer.disconnect();
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    applyTheme(next);
    setMode(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(readTheme() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { mode, setTheme, toggle };
}
