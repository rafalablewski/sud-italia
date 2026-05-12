"use client";

import { createPortal } from "react-dom";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

interface Props {
  /** Trigger element — receives onClick + ref. */
  trigger: ReactElement<{
    onClick?: (e: MouseEvent) => void;
    "aria-expanded"?: boolean;
    "aria-haspopup"?: string;
  }>;
  /** Content. Receives a `close` helper. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Where to anchor. Default: "bottom-start". */
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Match the trigger's width on the panel. */
  matchTriggerWidth?: boolean;
  /** Gap in px between trigger and panel. */
  offset?: number;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getViewportRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function Popover({
  trigger,
  children,
  placement = "bottom-start",
  matchTriggerWidth = false,
  offset = 6,
}: Props) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    const t = triggerRef.current;
    const p = panelRef.current;
    if (!t || !p) return;
    const rect = getViewportRect(t);
    const panelRect = p.getBoundingClientRect();
    const placeBottom = placement.startsWith("bottom");
    const placeEnd = placement.endsWith("end");
    const top = placeBottom ? rect.top + rect.height + offset : rect.top - panelRect.height - offset;
    const left = placeEnd ? rect.left + rect.width - panelRect.width : rect.left;
    const next: CSSProperties = {
      position: "fixed",
      top,
      left,
      zIndex: 80,
    };
    if (matchTriggerWidth) next.width = rect.width;
    setStyle(next);
  }, [matchTriggerWidth, offset, placement]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const handler = () => reposition();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!isValidElement(trigger)) return null;

  const wrappedTrigger = cloneElement(trigger, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
    },
    onClick: (e: MouseEvent) => {
      trigger.props.onClick?.(e);
      setOpen((o) => !o);
    },
    "aria-expanded": open,
    "aria-haspopup": "dialog",
  } as Parameters<typeof cloneElement>[1]);

  return (
    <>
      {wrappedTrigger}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            id={id}
            style={style}
            className="v2-popover"
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}
