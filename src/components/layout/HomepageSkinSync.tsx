"use client";

import { useEffect } from "react";
import { fetchPublicSettings } from "@/lib/public-settings";
import { resolveSkin } from "@/lib/theme-skins";

const STORAGE_KEY = "sud-homepage-skin";

/**
 * Applies the DB-global storefront skin on the client, the same way the rest
 * of the storefront reads runtime config (LayoutGate, CurrencySwitcher all
 * fetch /api/settings/public) — so the public pages stay STATIC instead of
 * going dynamic just to read one setting.
 *
 * Flow:
 *   1. The (public) layout's pre-paint boot script reads `localStorage`
 *      (written on a previous visit) and sets `data-skin` on <body> before
 *      paint → no flash on repeat visits.
 *   2. This component fetches the authoritative active skin from public
 *      settings, applies it to <body>, and refreshes the cached value.
 *
 * It targets <body> (not the wrapper) so the skin also reaches Rule-#4 portal
 * overlays that mount to document.body, and it REMOVES the attribute on unmount
 * so the skin can never linger on /admin or /core after a client-side nav.
 */
export function HomepageSkinSync() {
  useEffect(() => {
    let cancelled = false;
    fetchPublicSettings()
      .then((data) => {
        if (cancelled || !data) return;
        const skin = resolveSkin("homepage", data.homepageSkin);
        if (skin === "default") {
          document.body.removeAttribute("data-skin");
        } else {
          document.body.setAttribute("data-skin", skin);
        }
        try {
          if (skin === "default") localStorage.removeItem(STORAGE_KEY);
          else localStorage.setItem(STORAGE_KEY, skin);
        } catch {
          /* private mode / storage disabled — non-fatal, attr still applied */
        }
      })
      .catch(() => {
        /* fail-open: leave whatever the boot script applied */
      });
    return () => {
      cancelled = true;
      // Drop the attribute when leaving the storefront so a client-side nav to
      // /admin or /core doesn't inherit a stale storefront skin on <body>.
      document.body.removeAttribute("data-skin");
    };
  }, []);

  return null;
}
