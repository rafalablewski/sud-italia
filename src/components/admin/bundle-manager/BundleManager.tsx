"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import {
  Layers,
  LayoutGrid,
  PanelLeft,
  Table,
  Eye,
  Rows3,
  AlignLeft,
  Gauge,
  ChevronDown,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { MenuItem } from "@/data/types";
import type { BundleConfig } from "@/components/admin/AdminSellingShared";
import {
  ViewWizard,
  ViewCardGrid,
  ViewMasterDetail,
  ViewSpreadsheet,
  ViewLivePreview,
  ViewAccordion,
  ViewFlatMinimal,
  ViewMarginDashboard,
  ViewMobile,
  makeStarterBundle,
  type ViewProps,
} from "./BundleViews";
import { VIEW_MODES, useBundleViewMode, type ViewMode } from "./types";

/**
 * Top-level orchestrator for the Bundle ladders admin surface.
 *
 *   <BundleManager bundles={...} menu={...} onChange={...} />
 *
 * Owns:
 *   - the view-mode dropdown (operator picks from 8 list layouts;
 *     persisted to localStorage; auto-overridden to a mobile layout
 *     under 900px so the editor doesn't break on phones).
 *   - the dispatch to whichever view component is active.
 *
 * All views consume the same `bundles` array and emit patches through
 * the same callbacks; the editor experience inside any view is the
 * shared `BundleEditor` wizard. Switching view modes never loses data,
 * never duplicates state, and never requires an explicit save — the
 * standard admin "unsaved changes" indicator on the page header
 * handles persistence the way every other admin surface does.
 */

interface Props {
  bundles: BundleConfig[];
  menu: MenuItem[];
  onChange: (next: BundleConfig[]) => void;
}

const ICON_MAP: Record<ViewMode, LucideIcon> = {
  "wizard": Layers,
  "card-grid": LayoutGrid,
  "master-detail": PanelLeft,
  "spreadsheet": Table,
  "live-preview": Eye,
  "accordion": Rows3,
  "flat-minimal": AlignLeft,
  "margin-dashboard": Gauge,
};

export function BundleManager({ bundles, menu, onChange }: Props) {
  const { effective, preferred, setPreferred, isMobile } = useBundleViewMode();

  const handleUpdate = useCallback<ViewProps["onUpdate"]>(
    (id, patch) => onChange(bundles.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    [bundles, onChange],
  );
  const handleRemove = useCallback<ViewProps["onRemove"]>(
    (id) => onChange(bundles.filter((b) => b.id !== id)),
    [bundles, onChange],
  );
  const handleAdd = useCallback<ViewProps["onAdd"]>(
    (mealPeriod) => onChange([...bundles, makeStarterBundle(mealPeriod)]),
    [bundles, onChange],
  );

  const viewProps: ViewProps = {
    bundles,
    menu,
    onUpdate: handleUpdate,
    onAdd: handleAdd,
    onRemove: handleRemove,
  };

  return (
    <div className="bm-root">
      <header className="bm-root__head">
        <div className="bm-root__head-l">
          <h1 className="bm-root__title">Bundle ladders</h1>
          <p className="bm-root__hint">
            {bundles.length} {bundles.length === 1 ? "tier" : "tiers"} configured · {bundles.filter((b) => b.active).length} active.
            Edits save when you press <strong>Save changes</strong> on the page header.
          </p>
        </div>
        <div className="bm-root__head-r">
          <ViewSwitcher current={preferred} onChange={setPreferred} isMobileLock={isMobile} />
        </div>
      </header>

      <div className="bm-root__body">
        {effective === "mobile" || isMobile ? (
          <ViewMobile {...viewProps} />
        ) : effective === "wizard" ? (
          <ViewWizard {...viewProps} />
        ) : effective === "card-grid" ? (
          <ViewCardGrid {...viewProps} />
        ) : effective === "master-detail" ? (
          <ViewMasterDetail {...viewProps} />
        ) : effective === "spreadsheet" ? (
          <ViewSpreadsheet {...viewProps} />
        ) : effective === "live-preview" ? (
          <ViewLivePreview {...viewProps} />
        ) : effective === "accordion" ? (
          <ViewAccordion {...viewProps} />
        ) : effective === "flat-minimal" ? (
          <ViewFlatMinimal {...viewProps} />
        ) : (
          <ViewMarginDashboard {...viewProps} />
        )}
      </div>
    </div>
  );
}

function ViewSwitcher({
  current,
  onChange,
  isMobileLock,
}: {
  current: ViewMode;
  onChange: (m: ViewMode) => void;
  isMobileLock: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const currentDef = VIEW_MODES.find((m) => m.id === current) ?? VIEW_MODES[0];
  const CurrentIcon = ICON_MAP[currentDef.id];

  return (
    <div className="bm-vs" ref={ref}>
      {isMobileLock && (
        <span className="bm-vs__mobile-lock" title="Locked to mobile-friendly view on small screens">
          <Smartphone className="bm-icon-sm" /> mobile
        </span>
      )}
      <button
        type="button"
        className="bm-vs__trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={isMobileLock}
      >
        <CurrentIcon className="bm-icon-sm" />
        <span>{currentDef.label}</span>
        <ChevronDown className={`bm-icon-sm bm-vs__chev ${open ? "bm-vs__chev--open" : ""}`} />
      </button>
      {open && !isMobileLock && (
        <ul className="bm-vs__menu" role="listbox">
          {VIEW_MODES.map((m) => {
            const Icon = ICON_MAP[m.id];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={`bm-vs__item ${current === m.id ? "bm-vs__item--on" : ""}`}
                  onClick={() => { onChange(m.id); setOpen(false); }}
                >
                  <Icon className="bm-icon-sm" />
                  <span className="bm-vs__item-l">
                    <span className="bm-vs__item-label">{m.label}{m.id === "wizard" ? " (default)" : ""}</span>
                    <span className="bm-vs__item-hint">{m.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
