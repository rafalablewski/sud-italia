"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe viewport detection. Matches the existing desktop sidebar
 * breakpoint in globals.css (`@media (max-width: 900px)`) so the mobile
 * shell mounts in the same regime where the sidebar would otherwise hide.
 *
 * We expose both the live boolean and the "ready" flag so consumers can
 * render skeletons on first paint instead of flickering between layouts.
 */
const MOBILE_QUERY = "(max-width: 900px)";

export function useIsMobile(): { isMobile: boolean; ready: boolean } {
  const [isMobile, setIsMobile] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(mql.matches);
    apply();
    setReady(true);
    // Safari < 14 still fires on `addListener`; modern browsers use
    // `addEventListener`. Use the modern path with a fallback.
    if (mql.addEventListener) {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
    mql.addListener(apply);
    return () => mql.removeListener(apply);
  }, []);

  return { isMobile, ready };
}
