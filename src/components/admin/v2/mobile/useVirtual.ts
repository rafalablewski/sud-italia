"use client";

import { useCallback, useEffect, useState } from "react";

interface Options {
  /** Total row count in the list. */
  count: number;
  /** Estimated row height in px. The list assumes uniform-height rows. */
  rowHeight: number;
  /** How many extra rows to render above/below the visible window. */
  overscan?: number;
  /** Scroll container — defaults to window. */
  scrollElement?: HTMLElement | null;
}

interface VirtualWindow {
  /** Top padding to push rows down for unmounted prefix. */
  paddingTop: number;
  /** Bottom padding to reserve space for unmounted suffix. */
  paddingBottom: number;
  /** First row index to render (inclusive). */
  startIndex: number;
  /** Last row index to render (exclusive). */
  endIndex: number;
  /** Total scroll height the list occupies. */
  totalHeight: number;
}

/**
 * Tiny windowed-list hook for MobileList — only renders the rows the user
 * can see (plus an overscan band). Assumes uniform row height so we can
 * compute the window in O(1) and survive 50k-row lists on a phone.
 *
 * Scroll source defaults to the window (since the mobile shell is a
 * top-level vertical scroll). Callers with their own scroll container
 * pass it via `scrollElement`.
 */
export function useVirtual({
  count,
  rowHeight,
  overscan = 6,
  scrollElement,
}: Options): VirtualWindow & { measureRef: (el: HTMLElement | null) => void } {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  const [listOffset, setListOffset] = useState(0);

  // Measure where the list begins relative to the scroll element. The
  // ref callback runs when the list mounts; we record the result in
  // state so the window computation can react to it without violating
  // "no refs during render".
  const measureRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollY =
        scrollElement?.scrollTop ?? window.scrollY ?? document.documentElement.scrollTop;
      setListOffset(rect.top + scrollY);
    },
    [scrollElement],
  );

  useEffect(() => {
    const target: HTMLElement | Window = scrollElement ?? window;
    const onScroll = () => {
      const st =
        scrollElement?.scrollTop ?? window.scrollY ?? document.documentElement.scrollTop;
      setScrollTop(st);
    };
    const onResize = () => {
      setViewport(window.innerHeight);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();
    onResize();
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [scrollElement]);

  const totalHeight = count * rowHeight;
  const aboveListPx = Math.max(0, scrollTop - listOffset);
  const startIndex = Math.max(0, Math.floor(aboveListPx / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewport / rowHeight) + overscan * 2;
  const endIndex = Math.min(count, startIndex + visibleCount);

  return {
    startIndex,
    endIndex,
    paddingTop: startIndex * rowHeight,
    paddingBottom: Math.max(0, (count - endIndex) * rowHeight),
    totalHeight,
    measureRef,
  };
}
