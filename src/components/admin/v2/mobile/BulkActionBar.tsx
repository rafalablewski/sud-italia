"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  count: number;
  onClear: () => void;
  /** Primary action buttons rendered right-of-count. Provide 1–3. */
  children: ReactNode;
}

/**
 * Sticky bottom action bar for multi-select flows. Slides up from
 * just above the bottom nav, shows the selection count, and exposes
 * 1–3 primary actions plus an overflow slot.
 *
 * Portals to body so the admin-bg stacking context can't trap it.
 */
export function BulkActionBar({ open, count, onClear, children }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className={`v2-m-bulkbar ${open ? "is-open" : ""}`} role="region" aria-label="Bulk actions">
      <button
        type="button"
        className="v2-m-bulkbar-clear"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="v2-m-bulkbar-count tabular">{count} selected</span>
      <div className="v2-m-bulkbar-actions">{children}</div>
    </div>,
    document.body,
  );
}
