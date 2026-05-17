"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Prefetch a set of routes once the browser is idle. Uses
 * `requestIdleCallback` where available (Chrome / Edge / Firefox) and
 * falls back to a short setTimeout on Safari. Capped to a short
 * shortlist to avoid pre-warming everything (which would defeat the
 * code-splitting work).
 *
 * Call from `MobileShell` with the user's role-derived bottom-nav tabs +
 * a couple of high-traffic detail routes. The Next.js router caches
 * the RSC payload + JS for each prefetched route.
 */
export function useIdlePrefetch(routes: string[]): void {
  const router = useRouter();
  useEffect(() => {
    if (routes.length === 0) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const href of routes) {
        try {
          router.prefetch(href);
        } catch {
          /* never let prefetch crash the shell */
        }
      }
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    }).requestIdleCallback;
    let handle: number | null = null;
    if (typeof ric === "function") {
      handle = ric(run, { timeout: 2000 });
    } else {
      handle = window.setTimeout(run, 1500) as unknown as number;
    }
    return () => {
      cancelled = true;
      if (handle === null) return;
      const cic = (window as unknown as {
        cancelIdleCallback?: (h: number) => void;
      }).cancelIdleCallback;
      if (typeof cic === "function") cic(handle);
      else window.clearTimeout(handle);
    };
  }, [router, routes]);
}
