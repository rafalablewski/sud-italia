"use client";

import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "./chart-theme";
import { ChartTooltip } from "./ChartTooltip";

export interface LineSeries {
  key: string;
  label: string;
  /** Override the color. Falls back to the theme palette in order. */
  color?: string;
}

interface Props<R extends Record<string, unknown>> {
  data: R[];
  xKey: Extract<keyof R, string>;
  series: LineSeries[];
  height?: number;
  /** Format Y-axis tick. */
  yFormat?: (n: number) => string;
  /** Format X-axis tick. */
  xFormat?: (v: unknown) => string;
  /** Format tooltip value. */
  tooltipValue?: (n: number, key: string) => string;
  tooltipLabel?: (label: unknown) => string;
  /** Hide Y axis labels (sparkline-style). */
  hideYAxis?: boolean;
  /** Hide X axis labels. */
  hideXAxis?: boolean;
}

export function LineChart<R extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 240,
  yFormat,
  xFormat,
  tooltipValue,
  tooltipLabel,
  hideYAxis = false,
  hideXAxis = false,
}: Props<R>) {
  const { palette } = useChartTheme();
  const labelMap = Object.fromEntries(series.map((s) => [s.key, s.label]));
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey as unknown as never}
            tick={hideXAxis ? false : { fill: palette.axis, fontSize: 11 }}
            tickFormatter={xFormat as ((value: unknown) => string) | undefined}
            stroke={palette.grid}
            tickLine={false}
            axisLine={false}
            hide={hideXAxis}
          />
          <YAxis
            tick={hideYAxis ? false : { fill: palette.axis, fontSize: 11 }}
            tickFormatter={yFormat}
            stroke={palette.grid}
            tickLine={false}
            axisLine={false}
            hide={hideYAxis}
            width={hideYAxis ? 0 : 50}
          />
          <Tooltip
            cursor={{ stroke: palette.borderStrong, strokeDasharray: "3 3" }}
            content={<ChartTooltip labelMap={labelMap} format={tooltipValue} formatLabel={tooltipLabel} />}
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color ?? palette.chart[i % palette.chart.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive
              animationDuration={600}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
