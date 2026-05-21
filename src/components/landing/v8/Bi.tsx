"use client";

import { useSyncExternalStore } from "react";
import { getLocale } from "@/lib/i18n";

/**
 * Primary phrase that swaps EN/PL based on the active locale.
 *
 * Italian decorative flavor text (la pizza, una storia, etc.) is
 * rendered as a static <span className="v8-it">…</span> inline —
 * not via this component, since it's the same in every locale.
 *
 * SSR renders Polish (site default `lang="pl"`). On the client,
 * useSyncExternalStore reads the locale from localStorage and swaps
 * in if needed. LanguageSwitcher already does window.location.reload()
 * on change, so cross-tab `storage` events are mostly a safety net.
 */
function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): "pl" | "other" {
  if (typeof window === "undefined") return "pl";
  return getLocale() === "pl" ? "pl" : "other";
}

function getServerSnapshot(): "pl" | "other" {
  return "pl";
}

export function Bi({ en, pl }: { en: string; pl: string }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return <>{locale === "pl" ? pl : en}</>;
}
