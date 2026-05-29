"use client";

import { useEffect, useId, useRef, useState } from "react";

// V8 Trattoria nav dropdown — collapsed trigger pill + expanded option
// panel. Replaces the segmented-row pills that previously crowded the
// right cluster of the header. Used by <LanguageSwitcher /> and
// <CurrencySwitcher />.
//
// Behaviour:
//   - Click trigger to expand / collapse.
//   - Click outside or press Escape to collapse.
//   - The trigger's chevron rotates 180° while open.
//   - Tone variants: terracotta (language) + basil (currency) — same
//     palette the old segmented pills used so the colour memory carries
//     over.

export type NavDropdownTone = "terracotta" | "basil";

type Props = {
  label: string;
  ariaLabel: string;
  tone: NavDropdownTone;
  children: (close: () => void) => React.ReactNode;
};

export function NavDropdown({ label, ariaLabel, tone, children }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={wrapperRef} className={`v8-switcher v8-switcher-${tone} relative inline-flex`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        className="v8-switcher-trigger"
      >
        <span className="v8-switcher-trigger-label">{label}</span>
        <svg
          className={`v8-switcher-caret ${open ? "is-open" : ""}`}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
        >
          <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={panelId} role="listbox" aria-label={ariaLabel} className="v8-switcher-panel">
          {children(close)}
        </div>
      )}
    </div>
  );
}
