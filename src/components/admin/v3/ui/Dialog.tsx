"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { adminOverlayTargetV3 } from "./portal";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned header content (e.g. a status badge). */
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Max width in px. Default 520. */
  width?: number;
}

export function Dialog({ open, onClose, title, subtitle, headerExtra, footer, children, width = 520 }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  const target = adminOverlayTargetV3();
  if (!target) return null;

  return createPortal(
    <div className="av3-dialog-root" role="dialog" aria-modal="true">
      <div className="av3-dialog-scrim" onClick={onClose} aria-hidden />
      <div className="av3-dialog" style={{ maxWidth: width }}>
        <div className="av3-dialog-head">
          <div style={{ minWidth: 0 }}>
            <div className="av3-dialog-title">{title}</div>
            {subtitle && <div className="av3-dialog-sub">{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {headerExtra}
            <button type="button" className="av3-icon-btn" onClick={onClose} aria-label="Close">
              <X className="av3-btn-ico" />
            </button>
          </div>
        </div>
        <div className="av3-dialog-body">{children}</div>
        {footer && <div className="av3-dialog-foot">{footer}</div>}
      </div>
    </div>,
    target,
  );
}
