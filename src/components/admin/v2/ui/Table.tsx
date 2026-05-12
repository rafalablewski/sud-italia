"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export interface Column<R> {
  key: string;
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: R) => ReactNode;
  /** Sort by this getter. If omitted, sort is disabled for this column. */
  sortValue?: (row: R) => string | number | null | undefined;
  /** Right-align (numeric columns). */
  align?: "left" | "right" | "center";
  /** Column width hint (CSS). */
  width?: string;
  /** Sticky to the left edge (e.g. ID column). */
  sticky?: boolean;
}

interface Props<R> {
  rows: R[];
  columns: Column<R>[];
  /** Per-row React key. */
  rowKey: (row: R) => string;
  /** Optional initial sort. */
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /** Click handler for the entire row. */
  onRowClick?: (row: R) => void;
  /** Renders when rows is empty. */
  empty?: ReactNode;
  /** Smaller row padding. */
  density?: "default" | "compact";
  /** Enables a checkbox column. Parent owns the Set of selected ids. */
  selectable?: boolean;
  /** Set of selected row ids (when selectable=true). */
  selectedIds?: ReadonlySet<string>;
  /** Called whenever the selected set changes. Receives a fresh Set. */
  onSelectionChange?: (next: Set<string>) => void;
}

export function Table<R>({
  rows,
  columns,
  rowKey,
  defaultSort,
  onRowClick,
  empty,
  density = "default",
  selectable,
  selectedIds,
  onSelectionChange,
}: Props<R>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || !col.sortValue) return rows;
    const copy = [...rows];
    const getter = col.sortValue;
    copy.sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      // Nulls last
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sort.dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return copy;
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const allIds = useMemo(() => sorted.map((r) => rowKey(r)), [sorted, rowKey]);
  const selectedCount = selectedIds
    ? allIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0)
    : 0;
  const allSelected = selectable && allIds.length > 0 && selectedCount === allIds.length;
  const someSelected = selectable && selectedCount > 0 && !allSelected;

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(allIds));
  };

  return (
    <div className={`v2-table-wrap v2-table-${density}`}>
      <table className="v2-table">
        <thead>
          <tr>
            {selectable && (
              <th className="v2-th v2-th-left" style={{ width: "2.25rem" }}>
                <input
                  type="checkbox"
                  aria-label={allSelected ? "Deselect all" : "Select all"}
                  checked={!!allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !!someSelected;
                  }}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map((c) => {
              const sortable = !!c.sortValue;
              const isSorted = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`v2-th v2-th-${c.align ?? "left"} ${c.sticky ? "is-sticky" : ""}`}
                  aria-sort={isSorted ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="v2-th-btn"
                    >
                      <span>{c.header}</span>
                      <span className="v2-th-icon" aria-hidden>
                        {isSorted && sort!.dir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : isSorted && sort!.dir === "desc" ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3 v2-th-icon-faded" />
                        )}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="v2-td-empty">
                {empty ?? "No results"}
              </td>
            </tr>
          ) : (
            sorted.map((row) => {
              const id = rowKey(row);
              const isSelected = selectable && selectedIds?.has(id);
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${onRowClick ? "v2-tr-clickable" : ""} ${isSelected ? "v2-tr-selected" : ""}`.trim()}
                  style={isSelected ? { background: "rgba(185, 28, 28, 0.04)" } : undefined}
                >
                  {selectable && (
                    <td
                      className="v2-td v2-td-left"
                      onClick={(e) => {
                        // Don't trigger row-click when toggling the checkbox.
                        e.stopPropagation();
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={isSelected ? "Deselect row" : "Select row"}
                        checked={!!isSelected}
                        onChange={() => toggleRow(id)}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`v2-td v2-td-${c.align ?? "left"} ${c.sticky ? "is-sticky" : ""}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
