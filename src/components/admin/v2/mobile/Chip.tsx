"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  label: ReactNode;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  onRemove?: () => void;
  ariaLabel?: string;
}

/**
 * Filter chip. Toggleable when `onClick` is provided. Removable when
 * `onRemove` is provided (renders an X button that stops propagation).
 */
export function Chip({ label, active, count, onClick, onRemove, ariaLabel }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`v2-m-chip ${active ? "is-active" : ""}`}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      <span>{label}</span>
      {count != null && <span className="v2-m-chip-count">{count}</span>}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Remove filter"
          className="v2-m-chip-x"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onRemove();
            }
          }}
        >
          <X className="h-3 w-3" aria-hidden />
        </span>
      )}
    </button>
  );
}

interface StripProps {
  children: ReactNode;
  ariaLabel?: string;
}

export function ChipStrip({ children, ariaLabel }: StripProps) {
  return (
    <div className="v2-m-chip-strip" role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
