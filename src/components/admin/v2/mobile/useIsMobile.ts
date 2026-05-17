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

/**
 * Operator escape hatch — when set, all admin pages fall back to the
 * desktop layout even on small viewports. Useful for tablets in
 * landscape, foldables, and "I need the full editor on my phone"
 * cases. Toggle from the More drawer; stored in localStorage so it
 * survives reloads but resets per-device.
 */
export const FORCE_DESKTOP_KEY = "sud-admin-force-desktop";
const FORCE_DESKTOP_EVENT = "sud-admin-force-desktop-change";

export function getForceDesktop(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FORCE_DESKTOP_KEY) === "1";
  } catch {
    return false;
  }
}

export function setForceDesktop(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(FORCE_DESKTOP_KEY, "1");
    else window.localStorage.removeItem(FORCE_DESKTOP_KEY);
    window.dispatchEvent(new Event(FORCE_DESKTOP_EVENT));
  } catch {
    /* non-fatal */
  }
}

export type Viewport = "phone" | "tablet" | "desktop";

export function useIsMobile(): {
  isMobile: boolean;
  isTablet: boolean;
  viewport: Viewport;
  ready: boolean;
  forcedDesktop: boolean;
  /** True when the underlying viewport is small (≤ 900px) — independent
   *  of the force-desktop override. Used to surface "back to mobile"
   *  affordances after a user has flipped the escape hatch on. */
  rawIsMobile: boolean;
} {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [ready, setReady] = useState(false);
  const [forcedDesktop, setForcedDesktop] = useState(false);

  useEffect(() => {
    const mqlMobile = window.matchMedia(MOBILE_QUERY);
    const mqlTablet = window.matchMedia(TABLET_QUERY);
    const apply = () => {
      setIsMobile(mqlMobile.matches);
      setIsTablet(mqlTablet.matches);
    };
    apply();
    setForcedDesktop(getForceDesktop());
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
    const onForce = () => setForcedDesktop(getForceDesktop());
    window.addEventListener(FORCE_DESKTOP_EVENT, onForce);
    window.addEventListener("storage", onForce);
    return () => {
      unsubA();
      unsubB();
      window.removeEventListener(FORCE_DESKTOP_EVENT, onForce);
      window.removeEventListener("storage", onForce);
    };
  }, []);

  const rawViewport: Viewport = isTablet ? "tablet" : isMobile ? "phone" : "desktop";
  const effectiveMobile = forcedDesktop ? false : isMobile;
  const effectiveTablet = forcedDesktop ? false : isTablet;
  const viewport: Viewport = forcedDesktop ? "desktop" : rawViewport;
  return {
    isMobile: effectiveMobile,
    isTablet: effectiveTablet,
    viewport,
    ready,
    forcedDesktop,
    rawIsMobile: isMobile,
  };
}
