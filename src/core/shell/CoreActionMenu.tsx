"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type CoreMenuItem = {
  /** The menu row's label. */
  label: string;
  /** Fired on select (the menu closes first, then this runs). */
  onClick: () => void;
  /** Optional leading glyph (a unicode mark or an icon element). */
  icon?: ReactNode;
  /** `danger` tints the row for a destructive action. */
  tone?: "default" | "danger";
  disabled?: boolean;
};

/**
 * The ActionBar's **overflow menu** — a `⋯` trigger that blooms a portaled
 * dropdown of a surface's *occasional* actions, so the bar keeps to ONE inline
 * primary (+ the frequent action) and never clips on a narrow screen. The menu
 * is portaled to the `.core` root (Rule #4 — the admin `.admin-bg > *` stacking
 * trap doesn't apply here, but Core keeps the same discipline: overlays escape
 * their toolbar's `overflow` clip via a portal, never z-index alone).
 *
 * Dismisses on select · outside-click (the scrim) · Escape · scroll/resize
 * (which would strand the anchored position). Built from `.core-ovf-*` tokens —
 * see `docs/design-system/core/theme/README.md`.
 */
export function CoreActionMenu({
  items,
  label = "More actions",
}: {
  items: CoreMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [root, setRoot] = useState<Element | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Portal into the theme root so the popover inherits core tokens and escapes
  // the toolbar's `overflow-x` clip. Resolved on the client only.
  useEffect(() => {
    setRoot(document.querySelector(".core"));
  }, []);

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setPos({ top: b.bottom + 6, right: window.innerWidth - b.right });
  };
  const toggle = () => {
    if (!open) place();
    setOpen((o) => !o);
  };

  // While open: Escape closes, and any scroll/resize closes rather than letting
  // the fixed-positioned popover drift away from its trigger.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={open ? "core-iconbtn core-ovf-btn on" : "core-iconbtn core-ovf-btn"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open &&
        root &&
        pos &&
        createPortal(
          <div className="core-ovf-scrim" onMouseDown={() => setOpen(false)}>
            <div
              id={menuId}
              role="menu"
              aria-label={label}
              className="core-ovf-pop"
              style={{ top: pos.top, right: pos.right }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {items.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={it.tone === "danger" ? "core-ovf-item danger" : "core-ovf-item"}
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                >
                  {it.icon != null && (
                    <span className="ic" aria-hidden>
                      {it.icon}
                    </span>
                  )}
                  <span>{it.label}</span>
                </button>
              ))}
            </div>
          </div>,
          root,
        )}
    </>
  );
}
