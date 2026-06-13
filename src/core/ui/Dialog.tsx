"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Core's OWN modal dialog — no dependency on the admin `src/ui` kit. Portaled
 * into the `.core` theme root (so it inherits core tokens + fonts) and covers
 * the viewport with a fixed scrim. Esc + scrim-click close. Styled by
 * `.core-scrim` / `.core-modal*` in themes/core/index.css.
 */
export function CoreDialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => {
    setRoot(document.querySelector(".core"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !root) return null;

  return createPortal(
    <div className="core-scrim" onClick={onClose} role="presentation">
      <div
        className="core-modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="core-modal-h">
          <div className="core-modal-t">{title}</div>
          <button type="button" className="core-modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="core-modal-b">{children}</div>
        {footer && <div className="core-modal-f">{footer}</div>}
      </div>
    </div>,
    root,
  );
}
