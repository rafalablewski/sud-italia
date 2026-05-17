"use client";

import { useEffect, useRef, useState } from "react";

interface SpringConfig {
  /** Stiffness — higher = snappier. Default 180. */
  stiffness?: number;
  /** Damping — higher = less bounce. Default 22. */
  damping?: number;
  /** Mass of the spring. Default 1. */
  mass?: number;
  /** Below this delta, the animation snaps to rest. Default 0.01. */
  precision?: number;
}

/**
 * Tiny spring physics hook. Linear-grade transitions without bringing in
 * Framer Motion (~80 kB gzip). Uses RAF + verlet-style integration with
 * a fixed dt of 1/60s; close enough for UI use without time-step jitter.
 *
 * Respects `prefers-reduced-motion` — returns the target immediately.
 */
export function useSpring(target: number, config: SpringConfig = {}): number {
  const { stiffness = 180, damping = 22, mass = 1, precision = 0.01 } = config;
  const [value, setValue] = useState(target);
  const velocity = useRef(0);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef(target);
  const valueRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    const step = () => {
      const dt = 1 / 60;
      const force = -stiffness * (valueRef.current - targetRef.current);
      const drag = -damping * velocity.current;
      const accel = (force + drag) / mass;
      velocity.current += accel * dt;
      valueRef.current += velocity.current * dt;

      if (
        Math.abs(velocity.current) < precision &&
        Math.abs(valueRef.current - targetRef.current) < precision
      ) {
        valueRef.current = targetRef.current;
        velocity.current = 0;
        setValue(valueRef.current);
        rafRef.current = null;
        return;
      }
      setValue(valueRef.current);
      rafRef.current = requestAnimationFrame(step);
    };

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(step);
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [target, stiffness, damping, mass, precision]);

  return value;
}
