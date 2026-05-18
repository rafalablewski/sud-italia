"use client";

import { useMemo, type CSSProperties } from "react";
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
  /** Use a green→neutral→red diverging scale instead of a single-hue ramp.
   *  Intensity scales by |value| / max(|min|, |max|) so losses pop as red
   *  and gains pop as green at the same absolute magnitude. */
  diverging?: boolean;
}

/**
 * Lightweight SVG heatmap (Recharts doesn't ship one). Designed for
 * day-of-week × hour-of-day operational views.
 */
export function Heatmap({
  cells,
  xLabels,
  yLabels,
  max,
  rowHeight = 26,
  format,
  color,
  diverging = false,
}: Props) {
  const { palette } = useChartTheme();
  const accent = color ?? palette.brand;

  const grid = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cells) map.set(`${c.y}|${c.x}`, c.value);
    return map;
  }, [cells]);

  const computedMax = useMemo(
    () => max ?? Math.max(0, ...cells.map((c) => c.value)),
    [cells, max],
  );
  const divergingDenom = useMemo(
    () => (diverging ? Math.max(0, ...cells.map((c) => Math.abs(c.value))) : 0),
    [cells, diverging],
  );

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
            let cellStyle: CSSProperties;
            let labelVisible: boolean;
            if (diverging) {
              const dt = divergingDenom > 0 ? v / divergingDenom : 0;
              const intensity = Math.min(1, Math.abs(dt));
              const tint = dt >= 0 ? palette.success : palette.danger;
              cellStyle = {
                background: `color-mix(in oklab, ${tint} ${intensity * 90}%, var(--surface-2))`,
              };
              labelVisible = intensity > 0.5;
            } else {
              const t = computedMax > 0 ? v / computedMax : 0;
              cellStyle = { ["--v2-heat-t" as never]: String(t) };
              labelVisible = v > 0 && t > 0.6;
            }
            return (
              <div
                key={`c-${y}-${x}`}
                className="v2-heatmap-cell"
                style={cellStyle}
                title={format ? format(v) : String(v)}
              >
                {labelVisible && <span>{format ? format(v) : v}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
