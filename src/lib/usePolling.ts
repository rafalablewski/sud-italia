"use client";

import { useEffect, useRef } from "react";

/**
 * Visibility-aware polling — the one primitive every core-v2 screen uses instead
 * of a hand-rolled `setInterval`. It:
 *
 *  - runs `fn` every `ms` **only while the tab is visible**, so a backgrounded
 *    KDS tablet / POS till / floor board stops hammering the API the moment
 *    nobody is looking at it (and resumes — with an immediate refresh — when it
 *    comes back to the foreground);
 *  - schedules the next run **only after the previous one settles** (a
 *    `setTimeout` chain, not a fixed `setInterval`), so a fetch slower than `ms`
 *    can never overlap the next poll — the request pile-ups that make the OS
 *    feel laggy under a slow network are impossible by construction;
 *  - reads `fn` through a ref, so callers can pass an inline async closure
 *    without the loop tearing down and rebuilding on every render.
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let inFlight = false;

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // Run fn, then schedule the next run only once it has settled — so a slow
    // fetch defers the next poll instead of overlapping it. Guards against
    // re-entrancy (a foreground refresh racing an in-flight poll) and against
    // running on after unmount or while hidden.
    const run = async () => {
      timer = null;
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await saved.current();
      } catch {
        /* polling is best-effort — swallow and try again next tick */
      } finally {
        inFlight = false;
      }
      if (!cancelled && document.visibilityState === "visible") {
        timer = setTimeout(run, ms);
      }
    };

    const schedule = () => {
      if (!timer) timer = setTimeout(run, ms);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        clear();
        void run(); // refresh immediately on return to foreground, then chain
      } else {
        clear();
      }
    };

    if (document.visibilityState === "visible") schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
