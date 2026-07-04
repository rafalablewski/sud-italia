"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CoreFilterOption = {
  value: string;
  label: string;
  /** Optional trailing count pill (e.g. per-segment counts). */
  count?: number;
  /** Optional leading dot class (e.g. `core-gem bronze` for tier metals). */
  dot?: string;
};

export type CoreFilterGroup = {
  key: string;
  label: string;
  options: CoreFilterOption[];
  /** Currently selected value (or `null`). */
  value: string | null;
  onChange: (value: string | null) => void;
  /** The "no filter" value (default `null`) — used for the trigger badge + Reset. */
  base?: string | null;
  /** Re-clicking the selected option clears it back to `base` (optional filters). */
  clearable?: boolean;
  /** A preference, not a filter (e.g. Sort) — excluded from the active-count badge + Reset. */
  noBadge?: boolean;
};

/**
 * A **filter popover** for the ActionBar — one funnel `.core-iconbtn` trigger
 * (styled like the Guest Inbox header tools) that opens a portaled panel of
 * grouped, selectable options. Collapses a surface's several inline filter
 * capsules into a single right-side control; the trigger wears a count badge
 * when any filter is active. Portaled to the `.core` root (Rule #4), dismissed
 * on outside-click / Escape / scroll. See `docs/design-system/core/theme/README.md`.
 */
export function CoreFilterMenu({ groups, label = "Filters" }: { groups: CoreFilterGroup[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [root, setRoot] = useState<Element | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    setRoot(document.querySelector(".core"));
  }, []);

  const active = groups.filter((g) => !g.noBadge && (g.value ?? null) !== (g.base ?? null)).length;

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setPos({ top: b.bottom + 6, right: window.innerWidth - b.right });
  };
  const toggle = () => {
    if (!open) place();
    setOpen((o) => !o);
  };

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

  const reset = () =>
    groups.forEach((g) => {
      if (!g.noBadge && (g.value ?? null) !== (g.base ?? null)) g.onChange(g.base ?? null);
    });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={open || active ? "core-iconbtn core-filt-btn on" : "core-iconbtn core-filt-btn"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
        </svg>
        {active > 0 && <span className="core-filt-badge">{active}</span>}
      </button>
      {open &&
        root &&
        pos &&
        createPortal(
          <div className="core-ovf-scrim" onMouseDown={() => setOpen(false)}>
            <div
              id={menuId}
              role="dialog"
              aria-label={label}
              className="core-filt-pop"
              style={{ top: pos.top, right: pos.right }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {groups.map((g) => (
                <div key={g.key} className="core-filt-group">
                  <span className="core-filt-lbl">{g.label}</span>
                  <div className="core-filt-chips">
                    {g.options.map((o) => {
                      const on = (g.value ?? null) === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={on ? "core-filt-chip on" : "core-filt-chip"}
                          aria-pressed={on}
                          onClick={() => g.onChange(on && g.clearable ? (g.base ?? null) : o.value)}
                        >
                          {o.dot && <span className={o.dot} />}
                          {o.label}
                          {o.count != null && <span className="c">{o.count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {active > 0 && (
                <button type="button" className="core-filt-reset" onClick={reset}>
                  Reset filters
                </button>
              )}
            </div>
          </div>,
          root,
        )}
    </>
  );
}
