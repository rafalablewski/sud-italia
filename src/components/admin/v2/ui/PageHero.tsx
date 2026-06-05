import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import { ViewToolbar } from "./ViewToolbar";
import { Tabs } from "./Tabs";
import { Select } from "./Select";

interface TabOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}
interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  /** Page title — serif h1. */
  title: ReactNode;
  /** One-line description. Now surfaced behind the `PageHeader` ⓘ (kept off the bar). */
  subtitle?: ReactNode;
  /** Action buttons — the page's primary action (+ any compact secondaries). */
  actions?: ReactNode;
  /** Primary list/status filter — a pill `Tabs`, rendered in the view toolbar. */
  filter?: { value: string; onChange: (value: string) => void; options: TabOption[]; ariaLabel?: string };
  /** Verbose secondary filters — `Select` dropdowns in the view toolbar. */
  dropdowns?: { ariaLabel: string; value: string; onChange: (value: string) => void; options: SelectOption[] }[];
  /** Section navigation — an underline `Tabs`, the toolbar's left rail. */
  nav?: { value: string; onChange: (value: string) => void; options: TabOption[]; ariaLabel?: string };
}

/**
 * **Compatibility composition (redesign Phase 3).** `PageHero` no longer renders
 * the heavy platinum-railed `.v2-page-header` panel that merged identity +
 * control and stacked switcher idioms. It now composes the two slim primitives —
 * `PageHeader` (identity: title + ⓘ help + actions) and `ViewToolbar` (control:
 * underline nav + the filter / dropdown cluster) — so all ~40 existing call sites
 * get the new split surface with no per-page change.
 *
 * Location is gone (Phase 2 → shell `ScopeSwitcher`). Mappings:
 *   subtitle → PageHeader `info` (ⓘ popover, off the bar)
 *   actions  → PageHeader `primaryAction`
 *   nav      → ViewToolbar underline `Tabs`
 *   filter   → pill `Tabs` in the toolbar controls (scrolls on overflow)
 *   dropdowns→ `Select`s in the toolbar controls
 *
 * **New pages should call `PageHeader` + `ViewToolbar` directly** (and reach for
 * `Segmented` for ≤4-option filters, `Select` for more). See
 * `docs/design-system/admin/theme/components.md` → Redesign primitives.
 */
export function PageHero({ title, subtitle, actions, filter, dropdowns, nav }: Props) {
  const hasToolbar = !!(nav || filter || (dropdowns && dropdowns.length));
  return (
    <>
      <PageHeader title={title} info={subtitle} primaryAction={actions} />
      {hasToolbar && (
        <ViewToolbar
          tabs={
            nav
              ? { value: nav.value, onChange: nav.onChange, options: nav.options, ariaLabel: nav.ariaLabel }
              : undefined
          }
        >
          {filter && (
            <Tabs
              value={filter.value}
              onChange={filter.onChange}
              tabs={filter.options}
              variant="pill"
              ariaLabel={filter.ariaLabel ?? "Filter"}
            />
          )}
          {dropdowns?.map((d, i) => (
            <Select
              key={i}
              aria-label={d.ariaLabel}
              value={d.value}
              onChange={(e) => d.onChange(e.target.value)}
              options={d.options}
            />
          ))}
        </ViewToolbar>
      )}
    </>
  );
}
