"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Core v2's OWN modal dialog — no dependency on the admin `src/ui` kit. Portaled
 * into the `.cv2` theme root (so it inherits core-v2 tokens + fonts) and covers
 * the viewport with a fixed scrim. Esc + scrim-click close. Styled by
 * `.cv-scrim` / `.cv-modal*` in themes/core-v2/index.css.
 */
export function CoreV2Dialog({
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
    setRoot(document.querySelector(".cv2"));
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
    <div className="cv-scrim" onClick={onClose} role="presentation">
      <div
        className="cv-modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cv-modal-h">
          <div className="cv-modal-t">{title}</div>
          <button type="button" className="cv-modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="cv-modal-b">{children}</div>
        {footer && <div className="cv-modal-f">{footer}</div>}
      </div>
    </div>,
    root,
  );
}
