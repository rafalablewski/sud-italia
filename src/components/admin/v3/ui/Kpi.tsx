"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Sparkline } from "./Sparkline";

interface Props {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** % change vs the comparison window. Positive = up, negative = down. */
  deltaPct?: number | null;
  /** When true a positive delta is bad (e.g. cancellation rate) — flips colour. */
  invertDelta?: boolean;
  spark?: number[];
  /** Token (without var()) for the sparkline + accent. Defaults to brand. */
  accentVar?: string;
  /** Optional ⓘ explainer trigger (Rule #12) rendered at the end of the label row. */
  info?: ReactNode;
}

export function Kpi({ label, value, icon: Icon, deltaPct, invertDelta = false, spark, accentVar = "--av3-brand", info }: Props) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct! > 0.05;
  const down = hasDelta && deltaPct! < -0.05;
  // "good" direction: up is good unless inverted
  const good = up ? !invertDelta : down ? invertDelta : false;
  const bad = (up && invertDelta) || (down && !invertDelta);
  const deltaCls = good ? "av3-delta-up" : bad ? "av3-delta-down" : "av3-delta-flat";
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;

  return (
    <div className="av3-kpi">
      <div className="av3-kpi-label">
        {Icon && <Icon className="" />}
        {label}
        {info && <span style={{ marginLeft: "auto" }}>{info}</span>}
      </div>
      <div className="av3-kpi-value">{value}</div>
      <div className="av3-kpi-foot">
        {hasDelta ? (
          <span className={`av3-delta ${deltaCls}`}>
            <DeltaIcon />
            {Math.abs(deltaPct!).toFixed(1)}%
          </span>
        ) : (
          <span className="av3-delta av3-delta-flat">—</span>
        )}
        {spark && spark.length > 1 && (
          <span className="av3-kpi-spark">
            <Sparkline data={spark} strokeVar={accentVar} />
          </span>
        )}
      </div>
    </div>
  );
}
