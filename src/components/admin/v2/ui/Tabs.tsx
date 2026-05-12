"use client";

import { useCallback, useId, type ReactNode } from "react";

interface Tab<V extends string> {
  value: V;
  label: ReactNode;
  /** Optional badge/count rendered on the right of the label. */
  count?: number | string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface Props<V extends string> {
  value: V;
  onChange: (next: V) => void;
  tabs: Tab<V>[];
  /** "underline" (default) for content tabs, "pill" for filter chips. */
  variant?: "underline" | "pill";
  /** Stretch tabs to fill the container. */
  block?: boolean;
  ariaLabel?: string;
}

export function Tabs<V extends string>({ value, onChange, tabs, variant = "underline", block = false, ariaLabel }: Props<V>) {
  const groupId = useId();

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const enabled = tabs.map((t, i) => ({ ...t, i })).filter((t) => !t.disabled);
      if (enabled.length === 0) return;
      const here = enabled.findIndex((t) => t.i === idx);
      let next: number;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = enabled.length - 1;
      else if (e.key === "ArrowRight") next = (here + 1) % enabled.length;
      else next = (here - 1 + enabled.length) % enabled.length;
      onChange(enabled[next].value);
      // Focus the next tab button
      const root = e.currentTarget.parentElement;
      const btns = root?.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
      btns?.item(enabled[next].i).focus();
    },
    [onChange, tabs],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`v2-tabs v2-tabs-${variant} ${block ? "v2-tabs-block" : ""}`}
    >
      {tabs.map((t, i) => {
        const isActive = t.value === value;
        return (
          <button
            key={t.value}
            id={`${groupId}-tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={t.disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            onClick={() => !t.disabled && onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            disabled={t.disabled}
            className={`v2-tab ${isActive ? "is-active" : ""}`}
          >
            {t.icon && <span className="v2-tab-icon">{t.icon}</span>}
            <span>{t.label}</span>
            {t.count !== undefined && <span className="v2-tab-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
