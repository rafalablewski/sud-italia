"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { haptic } from "./haptics";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Set false for sheets that lock the user into a decision. */
  dismissible?: boolean;
  /** Renders a sticky footer below the scrollable body. */
  footer?: ReactNode;
  /** Visual variant. `full` = takes 92dvh; `auto` = sizes to content (capped). */
  size?: "auto" | "full";
  /** Accessibility label when no `title` is provided. */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Bottom sheet that lives in a portal on document.body — required because
 * CLAUDE.md rule 4 forbids relying on z-index inside `.admin-bg`. The sheet
 * supports drag-down dismiss with a velocity threshold (matches iOS feel).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  dismissible = true,
  footer,
  size = "auto",
  ariaLabel,
  children,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ y: number; time: number } | null>(null);
  const dragOffset = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissible]);

  const handleClose = () => {
    if (!dismissible) return;
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      onClose();
    }, 160);
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dismissible) return;
    dragStart.current = { y: e.clientY, time: Date.now() };
    dragOffset.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !panelRef.current) return;
    const dy = Math.max(0, e.clientY - dragStart.current.y);
    dragOffset.current = dy;
    panelRef.current.style.transform = `translateY(${dy}px)`;
    panelRef.current.style.transition = "none";
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !panelRef.current) return;
    const dy = dragOffset.current;
    const dt = Date.now() - dragStart.current.time;
    const velocity = dy / Math.max(dt, 1);
    const height = panelRef.current.getBoundingClientRect().height;
    const shouldClose = dy > height * 0.35 || velocity > 0.8;
    if (shouldClose) {
      haptic("light");
      handleClose();
    } else {
      // Snap back with a velocity-scaled spring — faster the further the
      // finger dragged, but always feels alive (never instant). The
      // overshoot cubic-bezier mimics the iOS sheet rebound.
      const dur = Math.min(420, Math.max(180, dy * 1.6));
      panelRef.current.style.transition = `transform ${dur}ms cubic-bezier(0.34, 1.18, 0.5, 1)`;
      panelRef.current.style.transform = "translateY(0)";
      // Clear the transition after it runs so future drags start clean.
      window.setTimeout(() => {
        if (panelRef.current) panelRef.current.style.transition = "";
      }, dur + 30);
    }
    dragStart.current = null;
    dragOffset.current = 0;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released — non-fatal */
    }
  };

  if (!mounted || (!open && !exiting)) return null;

  return createPortal(
    <div
      className="v2-m-sheet-root"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : ariaLabel ?? "Sheet"}
      data-state={exiting ? "exit" : "enter"}
    >
      <div
        className="v2-m-sheet-scrim"
        onClick={() => dismissible && handleClose()}
        aria-hidden
      />
      <div
        ref={panelRef}
        className="v2-m-sheet-panel"
        data-size={size}
      >
        {dismissible && (
          <div
            className="v2-m-sheet-handle"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="button"
            aria-label="Drag to dismiss"
            tabIndex={0}
          >
            <span aria-hidden />
          </div>
        )}
        {title && (
          <div className="v2-m-sheet-header">
            <div className="v2-m-sheet-title">{title}</div>
            {dismissible && (
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="v2-m-sheet-close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="v2-m-sheet-body">{children}</div>
        {footer && <div className="v2-m-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
