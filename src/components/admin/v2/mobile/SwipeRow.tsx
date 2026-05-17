"use client";

import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { haptic } from "./haptics";

type Tone =
  | "primary"
  | "brand"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

interface ActionConfig {
  label: string;
  tone?: Tone;
  onCommit: () => void;
}

interface Props {
  /** Action revealed by swiping right-to-left (typically destructive). */
  leftAction?: ActionConfig;
  /** Action revealed by swiping left-to-right (typically primary). */
  rightAction?: ActionConfig;
  /** Threshold in pixels at which the swipe commits the action. */
  threshold?: number;
  /** Width of the action drawer in px. */
  actionWidth?: number;
  children: ReactNode;
}

/**
 * Touch-friendly swipe row. Releasing past `threshold` commits the action
 * with a haptic tick. Below threshold, the row springs back. Designed for
 * orders, notifications, customers, inventory rows.
 *
 * Falls back gracefully on mouse pointers (e.g. Bluetooth-attached
 * trackpad) — same behaviour.
 */
export function SwipeRow({
  leftAction,
  rightAction,
  threshold = 80,
  actionWidth = 96,
  children,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef<number | null>(null);
  const startScrollLeft = useRef(0);
  const [dx, setDx] = useState(0);
  const [pointerType, setPointerType] = useState<string | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setPointerType(e.pointerType);
    startX.current = e.clientX;
    startScrollLeft.current = dx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startX.current == null) return;
    const raw = e.clientX - startX.current + startScrollLeft.current;
    // Constrain to revealed actions only.
    const lo = leftAction ? -actionWidth : 0;
    const hi = rightAction ? actionWidth : 0;
    const constrained = Math.max(lo, Math.min(hi, raw));
    setDx(constrained);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startX.current == null) return;
    const final = dx;
    startX.current = null;
    setPointerType(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* non-fatal */
    }
    if (final <= -threshold && leftAction) {
      haptic("warning");
      leftAction.onCommit();
      setDx(0);
      return;
    }
    if (final >= threshold && rightAction) {
      haptic("success");
      rightAction.onCommit();
      setDx(0);
      return;
    }
    setDx(0);
  };

  const isDragging = pointerType !== null;

  return (
    <div className="v2-m-swipe-row">
      {leftAction && (
        <div
          className={`v2-m-swipe-action v2-m-swipe-action-left v2-m-tone-${leftAction.tone ?? "danger"}`}
          style={{ width: actionWidth }}
          aria-hidden
        >
          {leftAction.label}
        </div>
      )}
      {rightAction && (
        <div
          className={`v2-m-swipe-action v2-m-swipe-action-right v2-m-tone-${rightAction.tone ?? "primary"}`}
          style={{ width: actionWidth }}
          aria-hidden
        >
          {rightAction.label}
        </div>
      )}
      <div
        ref={trackRef}
        className="v2-m-swipe-track"
        style={{
          transform: `translateX(${dx}px)`,
          transition: isDragging ? "none" : "transform 200ms cubic-bezier(0.32,0.72,0,1)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
