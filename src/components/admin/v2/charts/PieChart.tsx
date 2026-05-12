"use client";

import { Cell, Pie, PieChart as RPieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useChartTheme } from "./chart-theme";

interface Slice {
  name: string;
  value: number;
  color?: string;
}

interface Props {
  data: Slice[];
  height?: number;
  /** Inner radius (donut). 0 = pie. */
  innerRadius?: number;
  outerRadius?: number;
  /** Format the tooltip value. */
  format?: (n: number, name: string) => string;
}

export function PieChart({ data, height = 220, innerRadius = 50, outerRadius = 80, format }: Props) {
  const { palette } = useChartTheme();
  const total = data.reduce((acc, d) => acc + d.value, 0);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RPieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={1}
            stroke="none"
            isAnimationActive
            animationDuration={500}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? palette.chart[i % palette.chart.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: palette.surface1,
              border: `1px solid ${palette.borderStrong}`,
              borderRadius: 8,
              color: palette.fg,
              fontSize: 12,
            }}
            formatter={((value: unknown, name: unknown) => {
              const n = typeof value === "number" ? value : Number(value ?? 0);
              const label = typeof name === "string" ? name : String(name ?? "");
              return [
                format ? format(n, label) : `${n} (${total ? ((n / total) * 100).toFixed(1) : 0}%)`,
                label,
              ];
            }) as never}
          />
        </RPieChart>
      </ResponsiveContainer>
    </div>
  );
}
