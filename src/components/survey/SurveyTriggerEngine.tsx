"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSurveyStore } from "@/store/survey";

/**
 * Invisible signal watcher that drives the Pulse survey engine from real
 * browsing behaviour. Mounted once globally (public layout, behind the
 * `showNpsSurvey` gate). The engine itself (`useSurveyStore`) enforces all
 * the frequency restraint — this component just *fires* signals:
 *
 *   • prolonged-browse — stayed ~70s on a `/locations/[slug]` menu page
 *   • rewards-page     — dwelled ~20s on `/rewards`
 *   • repeat-visit     — a returning browser (2nd+ session) on the landing
 *   • exit-intent      — desktop pointer left the top of the viewport on a
 *                        buying page
 *
 * (post-order fires directly from the order-confirmation page.) Timers are
 * cancelled on navigation, so a signal only fires if the guest genuinely
 * lingered.
 */
const VISIT_KEY = "sud-visit-count";
const SESSION_FLAG = "sud-session-counted";

export function SurveyTriggerEngine() {
  const pathname = usePathname();
  const request = useSurveyStore((s) => s.request);
  const countedRef = useRef(false);

  // Count distinct sessions once (drives repeat-visit detection).
  useEffect(() => {
    if (countedRef.current || typeof window === "undefined") return;
    countedRef.current = true;
    try {
      if (!window.sessionStorage.getItem(SESSION_FLAG)) {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
        const total = Number(window.localStorage.getItem(VISIT_KEY) || "0") + 1;
        window.localStorage.setItem(VISIT_KEY, String(total));
      }
    } catch {
      // Private mode — repeat-visit just won't fire; everything else works.
    }
  }, []);

  useEffect(() => {
    if (!pathname || typeof window === "undefined") return;

    const locationMatch = pathname.match(/^\/locations\/([^/]+)/);
    const locationSlug = locationMatch?.[1];
    const isRewards = pathname === "/rewards";
    const isLanding = pathname === "/";

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (locationSlug) {
      timers.push(
        setTimeout(() => {
          void request("prolonged-browse", { locationSlug, pagePath: pathname });
        }, 70_000),
      );
    }

    if (isRewards) {
      timers.push(
        setTimeout(() => {
          void request("rewards-page", { pagePath: pathname });
        }, 20_000),
      );
    }

    if (isLanding) {
      let visits = 0;
      try {
        visits = Number(window.localStorage.getItem(VISIT_KEY) || "0");
      } catch {
        visits = 0;
      }
      if (visits >= 2) {
        timers.push(
          setTimeout(() => {
            void request("repeat-visit", { pagePath: pathname });
          }, 8_000),
        );
      }
    }

    // Desktop exit-intent — only on buying pages, only with a fine pointer.
    let armed = Boolean(locationSlug) || isRewards;
    const onMouseOut = (e: MouseEvent) => {
      if (!armed) return;
      if (e.clientY <= 0 && !e.relatedTarget) {
        armed = false;
        void request("exit-intent", { locationSlug, pagePath: pathname });
      }
    };
    const finePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: fine)").matches;
    if (armed && finePointer) {
      document.addEventListener("mouseout", onMouseOut);
    }

    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, [pathname, request]);

  return null;
}
