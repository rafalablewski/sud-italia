"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and lock the button. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leadingIcon?: ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: ReactNode;
  /** Stretch to fill parent width. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    block = false,
    className = "",
    disabled,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const classes = [
    "v2-btn",
    `v2-btn-${variant}`,
    `v2-btn-${size}`,
    block ? "v2-btn-block" : "",
    loading ? "is-loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="v2-btn-spinner" aria-hidden /> : leadingIcon}
      {children && <span className="v2-btn-label">{children}</span>}
      {!loading && trailingIcon}
    </button>
  );
});
