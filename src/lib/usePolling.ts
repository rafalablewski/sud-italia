"use client";

import { useEffect, useRef } from "react";

/**
 * Visibility-aware interval polling — the one primitive every core-v2 screen
 * uses instead of a hand-rolled `setInterval`. It:
 *
 *  - runs `fn` every `ms` **only while the tab is visible**, so a backgrounded
 *    KDS tablet / POS till / floor board stops hammering the API the moment
 *    nobody is looking at it (and resumes — with an immediate refresh — when it
 *    comes back to the foreground);
 *  - reads `fn` through a ref, so callers can pass an inline async closure
 *    without the interval tearing down and rebuilding on every render;
 *  - never stacks timers (one interval per mount), killing the overlapping-poll
 *    pile-ups that made the OS feel laggy.
 *
 * It deliberately does **not** fire on initial mount — components own their
 * first load (so it can run on the same tick as a location change). Pass
 * `enabled: false` to halt entirely (e.g. a paused board).
 */
export function usePolling(
  fn: () => void | Promise<void>,
  ms: number,
  opts: { enabled?: boolean } = {},
): void {
  const { enabled = true } = opts;
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled || ms <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => void saved.current();
    const startInterval = () => {
      if (!timer) timer = setInterval(tick, ms);
    };
    const stopInterval = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick(); // refresh immediately on return to foreground
        startInterval();
      } else {
        stopInterval();
      }
    };
    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
