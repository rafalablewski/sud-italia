"use client";

import { useCallback, useMemo, useState } from "react";

export interface MultiSelectApi<T extends string> {
  selected: ReadonlySet<T>;
  count: number;
  isActive: boolean;
  /** Toggle one id. If the set was empty, this enters select mode. */
  toggle: (id: T) => void;
  /** Replace the entire set. */
  set: (ids: Iterable<T>) => void;
  /** Clear and exit select mode. */
  clear: () => void;
  /** Programmatically enter select mode without selecting anything. */
  enter: () => void;
}

/**
 * Tiny state hook for long-press → multi-select flows. Pair with
 * `BulkActionBar` to give the operator a desktop-grade bulk-action
 * surface on a phone.
 *
 * Mode is implicit: `isActive = count > 0 || forced`. There is no
 * separate "select mode" toggle — long-press selects the first row,
 * and clearing the last selected row exits the mode.
 */
export function useMultiSelect<T extends string = string>(): MultiSelectApi<T> {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());
  const [forced, setForced] = useState(false);

  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const set = useCallback((ids: Iterable<T>) => {
    setSelected(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    setForced(false);
  }, []);

  const enter = useCallback(() => {
    setForced(true);
  }, []);

  return useMemo<MultiSelectApi<T>>(
    () => ({
      selected,
      count: selected.size,
      isActive: selected.size > 0 || forced,
      toggle,
      set,
      clear,
      enter,
    }),
    [selected, forced, toggle, set, clear, enter],
  );
}
