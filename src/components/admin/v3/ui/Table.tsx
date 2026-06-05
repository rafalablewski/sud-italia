"use client";

import type { ReactNode } from "react";

export interface ColumnV3<T> {
  key: string;
  header: ReactNode;
  /** Right-align + mono for numerics. */
  num?: boolean;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: ColumnV3<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
}

/** Compact table: sticky header, hairline rows, right-aligned numerics. */
export function Table<T>({ columns, rows, rowKey, onRowClick }: Props<T>) {
  return (
    <div className="av3-table-wrap">
      <table className="av3-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? "av3-th-num" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "av3-num" : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
