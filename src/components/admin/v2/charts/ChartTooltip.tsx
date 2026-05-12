"use client";

interface TooltipPayloadItem {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  stroke?: string;
}

interface Props {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: unknown;
  /** Override the rendered series labels (defaults to dataKey). */
  labelMap?: Record<string, string>;
  /** Format a numeric series value. */
  format?: (value: number, name: string) => string;
  /** Format the X-axis tooltip label (e.g. date). */
  formatLabel?: (label: unknown) => string;
}

export function ChartTooltip({ active, payload, label, labelMap, format, formatLabel }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  const formattedLabel = formatLabel ? formatLabel(label) : String(label ?? "");
  return (
    <div className="v2-chart-tooltip">
      {formattedLabel && <div className="v2-chart-tooltip-label">{formattedLabel}</div>}
      <ul>
        {payload.map((p) => {
          const key = String(p.dataKey ?? p.name ?? "");
          const seriesLabel = labelMap?.[key] ?? key;
          const value = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
          return (
            <li key={key}>
              <span className="v2-chart-tooltip-swatch" style={{ background: p.color || p.stroke || "#888" }} aria-hidden />
              <span className="v2-chart-tooltip-name">{seriesLabel}</span>
              <span className="v2-chart-tooltip-value">{format ? format(value, key) : value.toLocaleString()}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
