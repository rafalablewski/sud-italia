"use client";

import { useMemo } from "react";
import { useChartTheme } from "./chart-theme";

interface Cell {
  x: string | number;
  y: string | number;
  value: number;
}

interface Props {
  cells: Cell[];
  xLabels: (string | number)[];
  yLabels: (string | number)[];
  /** Override max value for color scaling. Defaults to data max. */
  max?: number;
  /** Pixel height of each row. */
  rowHeight?: number;
  format?: (value: number) => string;
  /** Color stop. Heatmap interpolates surface-2 → this color by value/max. */
  color?: string;
}

/**
 * Lightweight SVG heatmap (Recharts doesn't ship one). Designed for
 * day-of-week × hour-of-day operational views.
 */
export function Heatmap({ cells, xLabels, yLabels, max, rowHeight = 26, format, color }: Props) {
  const { palette } = useChartTheme();
  const accent = color ?? palette.brand;

  const grid = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cells) map.set(`${c.y}|${c.x}`, c.value);
    return map;
  }, [cells]);

  const computedMax = useMemo(() => max ?? Math.max(0, ...cells.map((c) => c.value)), [cells, max]);

  return (
    <div className="v2-heatmap" style={{ ["--v2-heat" as never]: accent }}>
      <div className="v2-heatmap-row v2-heatmap-head">
        <div className="v2-heatmap-corner" />
        {xLabels.map((x) => (
          <div key={`x-${x}`} className="v2-heatmap-x-label">
            {String(x)}
          </div>
        ))}
      </div>
      {yLabels.map((y) => (
        <div key={`row-${y}`} className="v2-heatmap-row" style={{ height: rowHeight }}>
          <div className="v2-heatmap-y-label">{String(y)}</div>
          {xLabels.map((x) => {
            const v = grid.get(`${y}|${x}`) ?? 0;
            const t = computedMax > 0 ? v / computedMax : 0;
            return (
              <div
                key={`c-${y}-${x}`}
                className="v2-heatmap-cell"
                style={{ ["--v2-heat-t" as never]: String(t) }}
                title={format ? format(v) : String(v)}
              >
                {v > 0 && t > 0.6 && <span>{format ? format(v) : v}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
