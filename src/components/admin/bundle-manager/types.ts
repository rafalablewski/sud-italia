"use client";

import { useEffect, useState } from "react";

/**
 * Top-level layout the operator can choose from when editing the bundle
 * ladders. The default is `wizard` — it's the most structured editor —
 * but operators with different mental models can flip to a card grid,
 * a spreadsheet, a master-detail split, etc. Mobile devices auto-flip
 * to `mobile` regardless of preference.
 *
 * Every view consumes the same `bundles: BundleConfig[]` and emits the
 * same patch / add / remove callbacks. The difference is *only* in how
 * the list is rendered and how the editor is summoned (inline vs sheet
 * vs popover). The editor itself is shared — that's the `BundleEditor`
 * wizard.
 */
export type ViewMode =
  | "wizard"
  | "card-grid"
  | "master-detail"
  | "spreadsheet"
  | "live-preview"
  | "accordion"
  | "flat-minimal"
  | "margin-dashboard";

export interface ViewModeDef {
  id: ViewMode;
  label: string;
  hint: string;
  /** Lucide icon name (resolved by the switcher). */
  icon: "Layers" | "LayoutGrid" | "PanelLeft" | "Table" | "Eye" | "Rows3" | "AlignLeft" | "Gauge";
}

export const VIEW_MODES: ViewModeDef[] = [
  { id: "wizard",           label: "Wizard tabs",      hint: "Default · structured editor with tabs per concern",          icon: "Layers" },
  { id: "card-grid",        label: "Card grid",        hint: "Compact summary cards — best for scanning at a glance",      icon: "LayoutGrid" },
  { id: "master-detail",    label: "Master / detail",  hint: "Sidebar list + right-pane editor",                            icon: "PanelLeft" },
  { id: "spreadsheet",      label: "Spreadsheet",      hint: "Every tier on one screen, edit cells in place",               icon: "Table" },
  { id: "live-preview",     label: "Live preview",     hint: "Form left, customer-facing cart chip right",                  icon: "Eye" },
  { id: "accordion",        label: "Accordion",        hint: "Collapsible rows — only one open at a time",                  icon: "Rows3" },
  { id: "flat-minimal",     label: "Flat minimal",     hint: "Notion-style reading mode — clean, scannable",                icon: "AlignLeft" },
  { id: "margin-dashboard", label: "Margin dashboard", hint: "Each tier as an analytics tile with margin gauge",            icon: "Gauge" },
];

export const DEFAULT_VIEW: ViewMode = "wizard";
const STORAGE_KEY = "sud-admin-bundle-view";
/** Below this width we override the operator's choice with the
 *  mobile-friendly card layout so the editor doesn't break on phones. */
export const MOBILE_BREAKPOINT = 900;

function isViewMode(v: string | null): v is ViewMode {
  if (!v) return false;
  return VIEW_MODES.some((m) => m.id === v);
}

/** Hook: persisted view mode + mobile override. Returns the *effective*
 *  view (which auto-flips to mobile under the breakpoint) plus the
 *  operator's *preferred* view so the switcher UI can still show their
 *  chosen mode. Setter persists to localStorage and updates state. */
export function useBundleViewMode(): {
  effective: ViewMode | "mobile";
  preferred: ViewMode;
  setPreferred: (m: ViewMode) => void;
  isMobile: boolean;
} {
  const [preferred, setPreferredState] = useState<ViewMode>(DEFAULT_VIEW);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Read persisted view + subscribe to viewport changes on mount.
    // localStorage is the external store here; the setState calls
    // intentionally hydrate React state from it — the React-docs
    // pattern for this is useSyncExternalStore but a one-shot effect
    // is fine when the value never changes from other tabs.
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isViewMode(stored)) setPreferredState(stored);
    } catch {
      /* storage may be blocked — non-fatal */
    }
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const setPreferred = (m: ViewMode) => {
    setPreferredState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* non-fatal */
    }
  };

  return {
    effective: isMobile ? "mobile" : preferred,
    preferred,
    setPreferred,
    isMobile,
  };
}

/** Concern-tabs inside the BundleEditor wizard. Each view either embeds
 *  the editor in its own pane or opens it in a sheet; the editor tabs
 *  are the same everywhere so an operator's muscle memory carries
 *  across view-mode switches. */
export type EditorTab =
  | "identity"
  | "pricing"
  | "composition"
  | "schedule"
  | "audience"
  | "margin";

export const EDITOR_TABS: { id: EditorTab; label: string; hint: string }[] = [
  { id: "identity",    label: "Identity",    hint: "Tier · name · description" },
  { id: "pricing",     label: "Pricing",     hint: "Mode · discount · mains gate" },
  { id: "composition", label: "Composition", hint: "Static add-on slots" },
  { id: "schedule",    label: "Schedule",    hint: "Days · scarcity · ladder role" },
  { id: "audience",    label: "Audience",    hint: "Mains scale · loyalty gate" },
  { id: "margin",      label: "Margin",      hint: "Live price + cost preview" },
];
