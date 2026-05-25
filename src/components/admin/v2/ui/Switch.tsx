"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Accessible label for the icon-only control. */
  label?: string;
}

/**
 * Shared on/off switch. One definition for every enable/disable toggle in the
 * admin — restyle `.v2-switch` once and every page follows.
 */
export const Switch = forwardRef<HTMLButtonElement, Props>(function Switch(
  { checked, onChange, label, className = "", disabled, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e);
        onChange?.(!checked);
      }}
      className={`v2-switch ${checked ? "is-on" : ""} ${className}`.trim()}
      {...rest}
    />
  );
});
