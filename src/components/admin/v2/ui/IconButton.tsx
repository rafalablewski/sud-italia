"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type IconButtonTone = "default" | "danger";
export type IconButtonSize = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: IconButtonTone;
  size?: IconButtonSize;
  /** Required — the control is icon-only. */
  label: string;
  children: ReactNode;
}

/**
 * Shared icon-only action button (delete, expand, etc.). Wraps `.v2-icon-btn`
 * so every icon affordance shares one set of borders / radius / hover tones.
 */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { tone = "default", size = "md", label, className = "", type = "button", children, ...rest },
  ref,
) {
  const classes = [
    "v2-icon-btn",
    size === "sm" ? "v2-icon-btn-sm" : "",
    tone === "danger" ? "v2-icon-btn-danger" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={classes} {...rest}>
      {children}
    </button>
  );
});
