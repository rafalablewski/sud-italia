"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  label: ReactNode;
  /** Element to attach the tooltip to. Must accept ref + event handlers. */
  children: ReactElement<{
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }>;
  /** Side of the trigger to display on. Default: "top". */
  side?: "top" | "bottom" | "left" | "right";
  /** Delay before showing (ms). Default: 350. */
  delay?: number;
}

const GAP = 8;

export function Tooltip({ label, children, side = "top", delay = 350 }: Props) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    const t = triggerRef.current;
    const p = tipRef.current;
    if (!t || !p) return;
    const r = t.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    let top = 0;
    let left = 0;
    switch (side) {
      case "top":
        top = r.top - pr.height - GAP;
        left = r.left + r.width / 2 - pr.width / 2;
        break;
      case "bottom":
        top = r.bottom + GAP;
        left = r.left + r.width / 2 - pr.width / 2;
        break;
      case "left":
        top = r.top + r.height / 2 - pr.height / 2;
        left = r.left - pr.width - GAP;
        break;
      case "right":
        top = r.top + r.height / 2 - pr.height / 2;
        left = r.right + GAP;
        break;
    }
    // clamp to viewport
    const vw = window.innerWidth;
    if (left < 4) left = 4;
    else if (left + pr.width > vw - 4) left = vw - pr.width - 4;
    setStyle({ position: "fixed", top, left, zIndex: 110 });
  }, [visible, side]);

  if (!isValidElement(children)) return children;

  const wrapped = cloneElement(children, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
    },
    onMouseEnter: () => {
      children.props.onMouseEnter?.();
      show();
    },
    onMouseLeave: () => {
      children.props.onMouseLeave?.();
      hide();
    },
    onFocus: () => {
      children.props.onFocus?.();
      show();
    },
    onBlur: () => {
      children.props.onBlur?.();
      hide();
    },
  } as Parameters<typeof cloneElement>[1]);

  return (
    <>
      {wrapped}
      {visible &&
        createPortal(
          <div ref={tipRef} role="tooltip" style={style} className="v2-tooltip">
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
