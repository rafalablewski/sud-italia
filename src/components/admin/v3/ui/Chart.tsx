"use client";

import { useId, type ReactNode } from "react";

/**
 * Inline-SVG chart primitives for admin-v3 — dependency-free, drawn straight
 * onto av3 tokens (the same technique as `Sparkline`). v3 cannot import the v2
 * Recharts wrappers (`components/admin/v2/charts`) under the isolation contract,
 * so these are the v3-native equivalents. Every fill / stroke is a CSS custom
 * property applied via `style`, so the charts track the active
 * `[data-admin-theme]` (dark / light) with no JS re-render.
 *
 * All SVGs use a fixed `viewBox` + `width="100%"` and scale uniformly, so they
 * stay crisp and undistorted at any container width.
 */

const VB_W = 520;

function ChartEmpty({ height }: { height: number }) {
  return (
    <div style={{ height, display: "grid", placeItems: "center", color: "var(--av3-subtle)", fontSize: 12 }}>
      No data in range
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Area chart — time series (revenue / profit trend).                         */
/* -------------------------------------------------------------------------- */
export interface AreaChartProps {
  /** Y values in display units (already converted, e.g. zł — not grosze). */
  data: number[];
  height?: number;
  /** Accent token name without `var()`. Default `--av3-c4`. */
  accentVar?: string;
  /** Optional [start, end] captions under the plot (e.g. dates / last value). */
  caption?: [ReactNode, ReactNode];
}

export function AreaChart({ data, height = 150, accentVar = "--av3-c4", caption }: AreaChartProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (data.length < 2) return <ChartEmpty height={height} />;
  const padX = 10, padT = 12, padB = 8;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const x = (i: number) => padX + (i / (data.length - 1)) * (VB_W - 2 * padX);
  const y = (v: number) => height - padB - ((v - min) / span) * (height - padT - padB);
  let line = "";
  data.forEach((v, i) => {
    line += `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
  });
  const area = `${line}L${x(data.length - 1).toFixed(1)} ${height - padB} L${x(0).toFixed(1)} ${height - padB} Z`;
  const lastX = x(data.length - 1), lastY = y(data[data.length - 1]);

  return (
    <>
      <svg viewBox={`0 0 ${VB_W} ${height}`} width="100%" style={{ height: "auto", display: "block" }} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={`ag${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: `var(${accentVar})`, stopOpacity: 0.26 }} />
            <stop offset="100%" style={{ stopColor: `var(${accentVar})`, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((g) => {
          const gy = padT + (g / 3) * (height - padT - padB);
          return <line key={g} x1={padX} y1={gy} x2={VB_W - padX} y2={gy} style={{ stroke: "var(--av3-grid)" }} strokeWidth={1} />;
        })}
        <path d={area} style={{ fill: `url(#ag${gid})` }} />
        <path d={line} fill="none" style={{ stroke: `var(${accentVar})` }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r={3.2} style={{ fill: `var(${accentVar})`, stroke: "var(--av3-s1)" }} strokeWidth={2} />
      </svg>
      {caption && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>
          <span>{caption[0]}</span>
          <span>{caption[1]}</span>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Bar chart — vertical bars (orders/day, dayparts).                          */
/* -------------------------------------------------------------------------- */
export interface BarDatum {
  label: string;
  value: number;
  /** Per-bar colour token without `var()`. Falls back to `accentVar`. */
  colorVar?: string;
}

export function BarChart({
  data,
  height = 150,
  accentVar = "--av3-c3",
  format,
}: {
  data: BarDatum[];
  height?: number;
  accentVar?: string;
  format?: (n: number) => string;
}) {
  if (!data.length) return <ChartEmpty height={height} />;
  const padX = 12, padT = 14, padB = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const slot = (VB_W - 2 * padX) / n;
  const bw = Math.min(slot * 0.6, 34);
  const showVals = n <= 12;

  return (
    <svg viewBox={`0 0 ${VB_W} ${height}`} width="100%" style={{ height: "auto", display: "block" }} role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const bh = (d.value / max) * (height - padT - padB);
        const bx = padX + i * slot + (slot - bw) / 2;
        const by = height - padB - bh;
        return (
          <g key={i}>
            <rect x={bx} y={by} width={bw} height={Math.max(0, bh)} rx={3} style={{ fill: `var(${d.colorVar ?? accentVar})` }} />
            {showVals && (
              <text x={bx + bw / 2} y={by - 5} textAnchor="middle" style={{ fill: "var(--av3-fg)", fontFamily: "var(--av3-mono)" }} fontSize={10}>
                {format ? format(d.value) : d.value}
              </text>
            )}
            {(showVals || i === 0 || i === n - 1) && (
              <text x={bx + bw / 2} y={height - 9} textAnchor="middle" style={{ fill: "var(--av3-muted)" }} fontSize={10}>
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Donut — part-to-whole (channel mix, category mix).                         */
/* -------------------------------------------------------------------------- */
export interface DonutDatum {
  label: string;
  value: number;
  /** Segment colour token without `var()`. */
  colorVar: string;
}

export function Donut({
  data,
  size = 150,
  centerValue,
  centerLabel,
}: {
  data: DonutDatum[];
  size?: number;
  centerValue?: string | number;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <ChartEmpty height={size} />;
  const cx = size / 2, cy = size / 2, r = size * 0.34, sw = size * 0.12;
  const C = 2 * Math.PI * r;
  // Precompute the cumulative start offset per segment before the render
  // (no mutation inside the JSX map — keeps the react-compiler lint happy).
  const offsets: number[] = [];
  data.reduce((acc, d) => {
    offsets.push(acc);
    return acc + (d.value / total) * C;
  }, 0);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Donut chart">
      <circle cx={cx} cy={cy} r={r} fill="none" style={{ stroke: "var(--av3-s3)" }} strokeWidth={sw} />
      {data.map((d, i) => {
        const len = (d.value / total) * C;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            style={{ stroke: `var(${d.colorVar})` }}
            strokeWidth={sw}
            strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
            strokeDashoffset={`${(-offsets[i]).toFixed(2)}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      {centerValue != null && (
        <text x={cx} y={cy - 1} textAnchor="middle" style={{ fill: "var(--av3-fg)", fontFamily: "var(--av3-mono)", fontWeight: 500 }} fontSize={size * 0.15}>
          {centerValue}
        </text>
      )}
      {centerLabel != null && (
        <text x={cx} y={cy + size * 0.11} textAnchor="middle" style={{ fill: "var(--av3-subtle)", letterSpacing: 1 }} fontSize={size * 0.058}>
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

/** Legend rows for a Donut / BarChart — colour swatch + label + formatted value. */
export function ChartLegend({
  items,
  format,
}: {
  items: { label: string; value: number; colorVar: string }[];
  format?: (n: number) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--av3-muted)" }}>
          <i style={{ width: 9, height: 9, borderRadius: 2, background: `var(${it.colorVar})`, flexShrink: 0 }} />
          {it.label} · {format ? format(it.value) : it.value}
        </span>
      ))}
    </div>
  );
}
