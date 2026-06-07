"use client";

import { useId } from "react";

interface Props {
  data: number[];
  width?: number;
  height?: number;
  /** CSS variable (without var()) for the stroke. Defaults to the brand. */
  strokeVar?: string;
  fill?: boolean;
  className?: string;
}

/**
 * Dependency-free inline-SVG sparkline. v3 keeps its own so it imports nothing
 * from v2's Recharts charts (which read v2's theme.ts). Colours come from
 * --av3-* tokens, never hardcoded hex.
 */
export function Sparkline({ data, width = 72, height = 24, strokeVar = "--av3-brand", fill = true, className = "" }: Props) {
  const gid = useId();
  if (!data || data.length < 2) {
    return <svg className={`av3-spark ${className}`} width={width} height={height} aria-hidden />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pad = 2;
  const usable = height - pad * 2;
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = pad + usable - ((v - min) / span) * usable;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const stroke = `var(${strokeVar})`;

  return (
    <svg className={`av3-spark ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {fill && (
        <>
          <linearGradient id={`sp-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          <path className="av3-spark-fill" d={area} fill={`url(#sp-${gid})`} style={{ opacity: 1 }} />
        </>
      )}
      <path className="av3-spark-line" d={line} stroke={stroke} />
    </svg>
  );
}
