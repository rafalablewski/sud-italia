"use client";

import { useId } from "react";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

interface Props<V extends string> {
  options: SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel?: string;
  /** Full-width vs intrinsic. Defaults to full. */
  fullWidth?: boolean;
}

/**
 * iOS-style segmented control. Two-to-four options is the sweet spot;
 * past that, prefer scrolling chips or tabs.
 */
export function SegmentControl<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fullWidth = true,
}: Props<V>) {
  const groupId = useId();
  return (
    <div
      className={`v2-m-segment ${fullWidth ? "is-full" : ""}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const id = `${groupId}-${opt.value}`;
        const checked = opt.value === value;
        return (
          <label key={opt.value} htmlFor={id} className={`v2-m-segment-opt ${checked ? "is-active" : ""}`}>
            <input
              id={id}
              type="radio"
              name={groupId}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
