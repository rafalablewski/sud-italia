"use client";

import {
  Area,
  AreaChart as RAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "./chart-theme";
import { ChartTooltip } from "./ChartTooltip";

export interface AreaSeries {
  key: string;
  label: string;
  color?: string;
  /** Stack id for stacked areas. */
  stackId?: string;
}

interface Props<R extends Record<string, unknown>> {
  data: R[];
  xKey: Extract<keyof R, string>;
  series: AreaSeries[];
  height?: number;
  yFormat?: (n: number) => string;
  xFormat?: (v: unknown) => string;
  tooltipValue?: (n: number, key: string) => string;
  tooltipLabel?: (label: unknown) => string;
}

export function AreaChart<R extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 240,
  yFormat,
  xFormat,
  tooltipValue,
  tooltipLabel,
}: Props<R>) {
  const { palette } = useChartTheme();
  const labelMap = Object.fromEntries(series.map((s) => [s.key, s.label]));
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RAreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => {
              const color = s.color ?? palette.chart[i % palette.chart.length];
              return (
                <linearGradient key={s.key} id={`v2-area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey as unknown as never}
            tick={{ fill: palette.axis, fontSize: 11 }}
            tickFormatter={xFormat as ((value: unknown) => string) | undefined}
            stroke={palette.grid}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: palette.axis, fontSize: 11 }}
            tickFormatter={yFormat}
            stroke={palette.grid}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            cursor={{ stroke: palette.borderStrong, strokeDasharray: "3 3" }}
            content={<ChartTooltip labelMap={labelMap} format={tooltipValue} formatLabel={tooltipLabel} />}
          />
          {series.map((s, i) => {
            const color = s.color ?? palette.chart[i % palette.chart.length];
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#v2-area-${s.key})`}
                stackId={s.stackId}
                isAnimationActive
                animationDuration={600}
              />
            );
          })}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
