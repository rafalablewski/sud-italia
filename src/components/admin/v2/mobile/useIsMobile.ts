"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe viewport detection. Phones (≤ 720px) get the full mobile
 * shell; tablet-portrait (720–900px) gets the mobile shell with a wider
 * content max-width and the bottom nav still anchored to thumb-reach.
 * Desktop (≥ 900px) gets the regular sidebar chrome — matches the
 * existing `@media (max-width: 900px)` rules.
 */
const MOBILE_QUERY = "(max-width: 900px)";
const TABLET_QUERY = "(min-width: 720px) and (max-width: 900px)";

export type Viewport = "phone" | "tablet" | "desktop";

export function useIsMobile(): { isMobile: boolean; isTablet: boolean; viewport: Viewport; ready: boolean } {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mqlMobile = window.matchMedia(MOBILE_QUERY);
    const mqlTablet = window.matchMedia(TABLET_QUERY);
    const apply = () => {
      setIsMobile(mqlMobile.matches);
      setIsTablet(mqlTablet.matches);
    };
    apply();
    setReady(true);
    const sub = (mql: MediaQueryList) => {
      if (mql.addEventListener) {
        mql.addEventListener("change", apply);
        return () => mql.removeEventListener("change", apply);
      }
      mql.addListener(apply);
      return () => mql.removeListener(apply);
    };
    const unsubA = sub(mqlMobile);
    const unsubB = sub(mqlTablet);
    return () => {
      unsubA();
      unsubB();
    };
  }, []);

  const viewport: Viewport = isTablet ? "tablet" : isMobile ? "phone" : "desktop";
  return { isMobile, isTablet, viewport, ready };
}
