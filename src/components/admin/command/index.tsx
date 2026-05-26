import type { ReactNode } from "react";

/**
 * Shared "command surface" markup — the reusable pieces of chrome the KDS
 * Atlas board and the POS till both render. Styling lives in the .cmd-*
 * classes in globals.css (driven by the :root --cmd-* palette).
 */

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional leading icon (POS channel). */
  icon?: ReactNode;
  /** Optional trailing count badge (KDS lane / stage switchers). */
  count?: number;
  /** Optional data-line key — drives the KDS ready/expo accent. */
  dataLine?: string;
}

/**
 * Segmented control. One framed row of mutually-exclusive options. Used by the
 * KDS lane/stage switchers (with count badges + ready/expo accent) and the POS
 * location / channel selectors (with icons; optionally disabled as a group).
 */
export function SegControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  options: SegOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="cmd-seg-group" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="cmd-seg"
          data-line={o.dataLine}
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          <span>{o.label}</span>
          {typeof o.count === "number" && <span className="cmd-seg-count tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Section eyebrow — the small uppercase brandline + hairline rule + right-hand
 * meta caption that heads the KDS fleet/floor command bars and the POS tab rail.
 */
export function SectionEyebrow({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="cmd-eyebrow">
      <span className="cmd-eyebrow-brand">
        {icon}
        {label}
      </span>
      <span className="cmd-eyebrow-sep" />
      {children != null && <span className="cmd-eyebrow-meta">{children}</span>}
    </div>
  );
}
