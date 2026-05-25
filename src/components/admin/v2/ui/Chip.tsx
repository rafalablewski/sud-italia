"use client";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Lock, X } from "lucide-react";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Toggled-on (selected) state. */
  selected?: boolean;
  leadingIcon?: ReactNode;
}

/**
 * Selectable toggle pill (category pickers, filter pills). Wraps `.v2-chip`
 * so the whole admin shares one tag/pill look — restyle once, applies
 * everywhere.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, leadingIcon, className = "", type = "button", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`v2-chip ${selected ? "is-on" : ""} ${className}`.trim()}
      aria-pressed={selected}
      {...rest}
    >
      {leadingIcon}
      {children}
    </button>
  );
});

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Sourced from menu data / a non-editable origin — renders a lock. */
  locked?: boolean;
  /** Small prefix (e.g. the item category) rendered before the label. */
  meta?: ReactNode;
  leadingIcon?: ReactNode;
  /** When set, renders an inline × button. */
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * Display / removable token (selected items, badges). Shares the `.v2-chip`
 * surface with {@link Chip} so a single CSS change restyles both.
 */
export function Tag({
  locked = false,
  meta,
  leadingIcon,
  onRemove,
  removeLabel = "Remove",
  className = "",
  children,
  ...rest
}: TagProps) {
  return (
    <span
      className={`v2-chip v2-chip-static ${locked ? "is-locked" : ""} ${className}`.trim()}
      {...rest}
    >
      {locked && <Lock className="v2-chip-lock h-3 w-3" aria-hidden />}
      {leadingIcon}
      {meta != null && <span className="v2-chip-meta">{meta}</span>}
      {children}
      {onRemove && (
        <button type="button" className="v2-chip-remove" onClick={onRemove} aria-label={removeLabel}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
