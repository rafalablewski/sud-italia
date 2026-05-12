"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  duration?: number;
  /** Ease function. Defaults to easeOutCubic. */
  ease?: (t: number) => number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a numeric value from its previous render value up to `to`. Skips
 * the animation for `prefers-reduced-motion` users.
 */
export function useCountUp(to: number, { duration = 800, ease = easeOutCubic }: Options = {}): number {
  const [value, setValue] = useState(to);
  const from = useRef(to);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || to === from.current) {
      setValue(to);
      from.current = to;
      return;
    }

    if (raf.current) cancelAnimationFrame(raf.current);
    start.current = null;
    const initial = from.current;
    const delta = to - initial;
    from.current = to;

    const tick = (ts: number) => {
      if (start.current === null) start.current = ts;
      const p = Math.min(1, (ts - start.current) / duration);
      setValue(initial + delta * ease(p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [to, duration, ease]);

  return value;
}
