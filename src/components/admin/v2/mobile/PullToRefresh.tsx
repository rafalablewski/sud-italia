"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCcw } from "lucide-react";
import { haptic } from "./haptics";

interface Props {
  onRefresh: () => Promise<unknown> | void;
  /** Distance in px the user must drag past to commit. */
  threshold?: number;
  /** Disable PTR — useful inside list virtualization or scrollable
   * sub-views where it would conflict with the inner scroll. */
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Native-feel pull-to-refresh. Activates only when the page is scrolled
 * to the very top. The visual indicator is a fill ring that builds as the
 * user drags; releasing past the threshold triggers `onRefresh` and shows
 * a spinner until the promise settles.
 */
export function PullToRefresh({
  onRefresh,
  threshold = 64,
  disabled,
  children,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (disabled) return;
    const el = wrapRef.current;
    if (!el) return;

    const isAtTop = () => (document.scrollingElement?.scrollTop ?? 0) <= 0;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing || !isAtTop()) return;
      startY.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startY.current;
      if (delta > 0) {
        // Resistance — feels like a real pull.
        setDy(Math.min(threshold * 1.6, delta * 0.55));
      } else {
        startY.current = null;
        setDy(0);
      }
    };
    const onTouchEnd = async () => {
      if (startY.current == null) return;
      const committed = dy >= threshold;
      startY.current = null;
      if (committed) {
        haptic("success");
        setRefreshing(true);
        setDy(threshold);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setDy(0);
        }
      } else {
        setDy(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled, dy, refreshing, threshold, onRefresh]);

  const progress = Math.min(1, dy / threshold);

  return (
    <div ref={wrapRef} className="v2-m-ptr">
      <div
        className="v2-m-ptr-indicator"
        style={{
          transform: `translateY(${dy - 32}px)`,
          opacity: progress,
        }}
        aria-hidden
      >
        <RefreshCcw
          className={`h-4 w-4 ${refreshing ? "v2-m-ptr-spin" : ""}`}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 220}deg)`,
          }}
        />
      </div>
      <div style={{ transform: `translateY(${dy * 0.7}px)` }}>{children}</div>
    </div>
  );
}
