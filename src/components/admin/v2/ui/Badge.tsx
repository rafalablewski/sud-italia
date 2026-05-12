"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "info"
  | "success"
  | "warning"
  | "danger";

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Filled vs. soft (default) vs. outlined. */
  variant?: "soft" | "solid" | "outline";
  /** Small dot before the label, useful for status pills. */
  dot?: boolean;
  /** Icon rendered before the label. */
  icon?: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, Props>(function Badge(
  { tone = "neutral", variant = "soft", dot = false, icon, className = "", children, ...rest },
  ref,
) {
  const classes = [
    "v2-badge",
    `v2-badge-${variant}`,
    `v2-badge-tone-${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span ref={ref} className={classes} {...rest}>
      {dot && <span className="v2-badge-dot" aria-hidden />}
      {icon && <span className="v2-badge-icon">{icon}</span>}
      <span>{children}</span>
    </span>
  );
});

/** Convenience mapping for order/slot status badges. Use everywhere a status string surfaces. */
export const ORDER_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  confirmed: "info",
  preparing: "info",
  ready: "success",
  completed: "success",
  cancelled: "danger",
};
