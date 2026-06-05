"use client";

import { useCallback, useId, type ReactNode } from "react";

interface Option<V extends string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  count?: number | string;
  disabled?: boolean;
}

interface Props<V extends string> {
  value: V;
  onChange: (next: V) => void;
  options: Option<V>[];
  /** Stretch options to fill the container width. */
  block?: boolean;
  ariaLabel?: string;
}

/**
 * Segmented control — the canonical **filter** widget for a small set of
 * mutually-exclusive options (≤ 4 short labels: status All/Open/Closed,
 * view-mode toggles, period flips). For 5+ or long options use `Select`; for
 * stackable multi-dimensional filtering use filter chips. For navigation between
 * sub-views use the underline `Tabs`. See the switching taxonomy in
 * `docs/design-system/admin/redesign-blueprint.md` §3.2.
 *
 * **Selection-as-raise** (the post-redesign selection language): the active
 * segment is a neutral raise — `--surface-3` + `--border-strong` + full-contrast
 * `--fg` text — never a brand flood and never a border-drop, so there is zero
 * layout shift between states and brand stays reserved for the one commit action.
 */
export function Segmented<V extends string>({ value, onChange, options, block = false, ariaLabel }: Props<V>) {
  const groupId = useId();

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const enabled = options.map((o, i) => ({ ...o, i })).filter((o) => !o.disabled);
      if (enabled.length === 0) return;
      const here = enabled.findIndex((o) => o.i === idx);
      let next: number;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = enabled.length - 1;
      else if (e.key === "ArrowRight") next = (here + 1) % enabled.length;
      else next = (here - 1 + enabled.length) % enabled.length;
      onChange(enabled[next].value);
      const root = e.currentTarget.parentElement;
      const btns = root?.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      btns?.item(enabled[next].i).focus();
    },
    [onChange, options],
  );

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`v2-seg ${block ? "v2-seg-block" : ""}`}>
      {options.map((o, i) => {
        const isActive = o.value === value;
        return (
          <button
            key={o.value}
            id={`${groupId}-seg-${o.value}`}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-disabled={o.disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            onClick={() => !o.disabled && onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            disabled={o.disabled}
            className={`v2-seg-opt ${isActive ? "is-active" : ""}`}
          >
            {o.icon && <span className="v2-seg-icon">{o.icon}</span>}
            <span>{o.label}</span>
            {o.count !== undefined && <span className="v2-seg-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
