"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { useChartTheme } from "./chart-theme";

interface Props {
  values: number[];
  height?: number;
  color?: string;
  /** Show the area under the line. */
  filled?: boolean;
}

export function Sparkline({ values, height = 36, color, filled = false }: Props) {
  const { palette } = useChartTheme();
  const data = values.map((v, i) => ({ i, v }));
  const stroke = color ?? palette.chart[0];
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            fill={filled ? stroke : undefined}
            fillOpacity={filled ? 0.18 : 0}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
