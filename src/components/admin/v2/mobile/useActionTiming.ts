"use client";

import { useCallback, useRef } from "react";

/**
 * Operator-action timing instrument. Records `start(name)` and
 * `stop(name)` calls and emits the span to the existing
 * `/api/admin/telemetry` endpoint (with `navigator.sendBeacon` so it
 * survives a page unload).
 *
 * Used to validate the audit's success criteria — time-to-refund ≤ 12s,
 * bump latency ≤ 1.5s. The endpoint can be a no-op in dev; the helper
 * never throws.
 */
interface TimingApi {
  start: (name: string) => void;
  stop: (name: string, extras?: Record<string, unknown>) => number | null;
  /** Convenience wrapper for the common case: start before fetch, stop on resolve. */
  measure: <T>(name: string, fn: () => Promise<T>, extras?: Record<string, unknown>) => Promise<T>;
}

const TELEMETRY_PATH = "/api/admin/telemetry";

function emit(payload: {
  span: string;
  durationMs: number;
  ts: string;
  extras?: Record<string, unknown>;
}): void {
  if (typeof navigator === "undefined") return;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if ("sendBeacon" in navigator) {
      navigator.sendBeacon(TELEMETRY_PATH, blob);
      return;
    }
    // Older Safari: fall back to a fire-and-forget fetch with keepalive.
    fetch(TELEMETRY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never break the UI on a telemetry failure */
  }
}

export function useActionTiming(): TimingApi {
  const ref = useRef<Map<string, number>>(new Map());

  const start = useCallback((name: string) => {
    ref.current.set(name, performance.now());
  }, []);

  const stop = useCallback(
    (name: string, extras?: Record<string, unknown>): number | null => {
      const startedAt = ref.current.get(name);
      if (startedAt === undefined) return null;
      ref.current.delete(name);
      const durationMs = Math.round(performance.now() - startedAt);
      emit({
        span: name,
        durationMs,
        ts: new Date().toISOString(),
        extras,
      });
      return durationMs;
    },
    [],
  );

  const measure = useCallback(
    async <T,>(
      name: string,
      fn: () => Promise<T>,
      extras?: Record<string, unknown>,
    ): Promise<T> => {
      start(name);
      try {
        return await fn();
      } finally {
        stop(name, extras);
      }
    },
    [start, stop],
  );

  return { start, stop, measure };
}
