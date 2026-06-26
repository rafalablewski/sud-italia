"use client";

import { useEffect } from "react";

/**
 * Tags <html> with `data-display-mode="standalone"` when the app is running as
 * an installed PWA (home-screen launch), so CSS can drop browser-oriented
 * affordances and behave more like a native app — no rubber-band overscroll, the
 * install button self-hides (it already checks this), etc. Covers both the
 * `display-mode: standalone` media query (Android/desktop) and iOS Safari's
 * `navigator.standalone`. Mounted once in the root layout.
 */
export function StandaloneClass(): null {
  useEffect(() => {
    const apply = () => {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      document.documentElement.dataset.displayMode = standalone ? "standalone" : "browser";
    };
    apply();
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", apply);
    return () => mq?.removeEventListener?.("change", apply);
  }, []);
  return null;
}
