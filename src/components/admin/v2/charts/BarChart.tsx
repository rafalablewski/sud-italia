"use client";

import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "./chart-theme";
import { ChartTooltip } from "./ChartTooltip";

export interface BarSeries {
  key: string;
  label: string;
  color?: string;
  stackId?: string;
}

interface Props<R extends Record<string, unknown>> {
  data: R[];
  xKey: Extract<keyof R, string>;
  series: BarSeries[];
  height?: number;
  yFormat?: (n: number) => string;
  xFormat?: (v: unknown) => string;
  tooltipValue?: (n: number, key: string) => string;
  tooltipLabel?: (label: unknown) => string;
  /** Horizontal bar layout. */
  layout?: "horizontal" | "vertical";
}

export function BarChart<R extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 240,
  yFormat,
  xFormat,
  tooltipValue,
  tooltipLabel,
  layout = "horizontal",
}: Props<R>) {
  const { palette } = useChartTheme();
  const labelMap = Object.fromEntries(series.map((s) => [s.key, s.label]));
  const isVertical = layout === "vertical";

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RBarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: 8, left: isVertical ? 0 : 0, bottom: 0 }}
        >
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={isVertical} horizontal={!isVertical} />
          {isVertical ? (
            <>
              <XAxis type="number" tick={{ fill: palette.axis, fontSize: 11 }} tickFormatter={yFormat} stroke={palette.grid} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey={xKey as unknown as never} tick={{ fill: palette.axis, fontSize: 11 }} stroke={palette.grid} tickLine={false} axisLine={false} width={90} />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey as unknown as never}
                tick={{ fill: palette.axis, fontSize: 11 }}
                tickFormatter={xFormat as ((value: unknown) => string) | undefined}
                stroke={palette.grid}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fill: palette.axis, fontSize: 11 }} tickFormatter={yFormat} stroke={palette.grid} tickLine={false} axisLine={false} width={50} />
            </>
          )}
          <Tooltip
            cursor={{ fill: palette.surfaceHover, opacity: 0.5 }}
            content={<ChartTooltip labelMap={labelMap} format={tooltipValue} formatLabel={tooltipLabel} />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.color ?? palette.chart[i % palette.chart.length]}
              radius={[4, 4, 0, 0]}
              stackId={s.stackId}
              isAnimationActive
              animationDuration={500}
            />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
