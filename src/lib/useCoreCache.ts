"use client";

import { useCallback, useState } from "react";

/**
 * A drop-in replacement for `useState` whose value is mirrored in a
 * **module-level cache** keyed by `key`. The cache lives for the lifetime of
 * the client session (a single page load), surviving the component
 * unmount/remount that a client-side navigation between Core surfaces causes.
 *
 * Why: Core navigation is already a soft (no-reload) `<Link>` transition, but
 * every surface component still *remounts* when you switch pages/tabs — so its
 * `useState(null)` resets and the surface flashes a "Loading…" state before its
 * `usePolling`/mount fetch repaints. Seeding the initial state from the cache
 * makes the return render the LAST-known data **instantly**; the surface's
 * normal load then revalidates it in the background (stale-while-revalidate).
 * The net effect: switching pages/tabs feels instant, and nothing you open is
 * ever blank — it shows the latest data it had, then updates.
 *
 * Always **key by the axes the data depends on** (surface + location, e.g.
 * `` `core:tables:${loc}` ``) so one location can never render another's cached
 * rows. The cache is intentionally in-memory only: a genuine full reload starts
 * clean, and correctness is guaranteed by the background revalidation, never by
 * the cache.
 */
const store = new Map<string, unknown>();

export function useCoreCache<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        store.set(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

/** Read a cached value without subscribing (e.g. to seed a derived flag). */
export function peekCoreCache<T>(key: string): T | undefined {
  return store.has(key) ? (store.get(key) as T) : undefined;
}
