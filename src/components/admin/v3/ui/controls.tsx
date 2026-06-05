"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Button — two primaries, three secondaries (per the admin theme doctrine).  */
/* -------------------------------------------------------------------------- */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const v = variant === "primary" ? "av3-btn-primary" : variant === "ghost" ? "av3-btn-ghost" : variant === "danger" ? "av3-btn-danger" : "";
  const s = size === "sm" ? "av3-btn-sm" : "";
  return (
    <button type={type} className={`av3-btn ${v} ${s} ${className}`.trim()} disabled={disabled || loading} {...rest}>
      {loading && <span className="av3-spin" aria-hidden style={{ width: 13, height: 13 }} />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */
export type BadgeTone = "neutral" | "ok" | "warn" | "bad" | "info" | "brand";

export function Badge({ tone = "neutral", dot = false, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`av3-badge av3-badge-${tone}`}>
      {dot && <span className="av3-badge-dot" aria-hidden />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* ChipRow — segmented selector (e.g. dashboard period)                       */
/* -------------------------------------------------------------------------- */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="av3-chiprow" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`av3-chip ${o.value === value ? "is-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
