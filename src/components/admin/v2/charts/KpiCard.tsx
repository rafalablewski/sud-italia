"use client";

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCountUp } from "../hooks/useCountUp";
import { Sparkline } from "./Sparkline";

interface Props {
  label: ReactNode;
  /** Current value (numeric). For non-numeric values use `display`. */
  value: number;
  /** Custom formatter for the value. */
  format?: (n: number) => string;
  /** Optional unit/suffix (e.g. "PLN", "%"). */
  unit?: string;
  /** Pre-formatted display string — bypasses count-up + format. */
  display?: ReactNode;
  /** Numeric delta vs. previous period, e.g. +12.4 means +12.4%. */
  delta?: number;
  /** Whether higher delta = good (default true). Inverts color for "bad up" metrics like food cost %. */
  higherIsBetter?: boolean;
  /** Sparkline series. */
  trend?: number[];
  /** Optional icon shown top-right. */
  icon?: LucideIcon;
  /** Brand tint applied to the icon background. */
  tone?: "neutral" | "brand" | "info" | "success" | "warning" | "danger";
  /** Caption rendered under the value. */
  hint?: ReactNode;
  /** Disables the count-up animation. */
  staticValue?: boolean;
}

function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

export function KpiCard({
  label,
  value,
  format,
  unit,
  display,
  delta,
  higherIsBetter = true,
  trend,
  icon: Icon,
  tone = "neutral",
  hint,
  staticValue = false,
}: Props) {
  const animated = useCountUp(staticValue ? value : value);
  const shown = staticValue ? value : animated;
  const formatted = display ?? (format ? format(shown) : Math.round(shown).toLocaleString());

  let deltaClass = "v2-kpi-delta-flat";
  let DeltaIcon: LucideIcon = Minus;
  if (delta !== undefined) {
    if (delta > 0.05) {
      deltaClass = higherIsBetter ? "v2-kpi-delta-up" : "v2-kpi-delta-down";
      DeltaIcon = ArrowUpRight;
    } else if (delta < -0.05) {
      deltaClass = higherIsBetter ? "v2-kpi-delta-down" : "v2-kpi-delta-up";
      DeltaIcon = ArrowDownRight;
    }
  }

  return (
    <div className="v2-kpi">
      <div className="v2-kpi-top">
        <div className="v2-kpi-label">{label}</div>
        {Icon && (
          <div className={`v2-kpi-icon v2-kpi-tone-${tone}`} aria-hidden>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="v2-kpi-value-row">
        <span className="v2-kpi-value tabular">{formatted}</span>
        {unit && <span className="v2-kpi-unit">{unit}</span>}
      </div>
      <div className="v2-kpi-foot">
        <div className="v2-kpi-meta">
          {delta !== undefined && (
            <span className={`v2-kpi-delta ${deltaClass}`}>
              <DeltaIcon className="h-3 w-3" />
              {formatDelta(delta)}
            </span>
          )}
          {hint && <span className="v2-kpi-hint">{hint}</span>}
        </div>
        {trend && trend.length > 1 && (
          <div className="v2-kpi-spark">
            <Sparkline values={trend} height={30} filled />
          </div>
        )}
      </div>
    </div>
  );
}
