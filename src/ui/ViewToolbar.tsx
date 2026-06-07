"use client";

import type { ReactNode } from "react";
import { Tabs } from "./Tabs";

interface TabOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number | string;
}

interface Props {
  /**
   * Sub-view navigation — ALWAYS the underline `Tabs` (Orders Kanban/Table,
   * Recipes/Ingredients, Settings sections). Navigation only — not filtering.
   */
  tabs?: { value: string; onChange: (value: string) => void; options: TabOption[]; ariaLabel?: string };
  /**
   * Right-aligned control cluster: filter chips, `Segmented`, `Select`, sort,
   * display. Free-form so a page composes the right filters — but use the
   * canonical widgets (see the switching taxonomy, blueprint §3.2).
   */
  children?: ReactNode;
  /** Stick the toolbar under the page header on scroll (long tables/boards). */
  sticky?: boolean;
}

/**
 * The **control** half of the command surface (blueprint §4). A slim, panel-less
 * bar attached to the data region: sub-view tabs on the left, the filter / sort /
 * display cluster on the right. Separated from identity (`PageHeader`) so the two
 * never merge and three switcher idioms never stack in one panel again.
 *
 * Omit entirely on pages with no navigation and no filters. See
 * `docs/design-system/admin/theme/components.md` → View toolbar.
 */
export function ViewToolbar({ tabs, children, sticky = false }: Props) {
  return (
    <div className={`v2-toolbar ${sticky ? "v2-toolbar-sticky" : ""}`}>
      <div className="v2-toolbar-nav">
        {tabs && (
          <Tabs
            value={tabs.value}
            onChange={tabs.onChange}
            tabs={tabs.options}
            variant="underline"
            ariaLabel={tabs.ariaLabel ?? "View"}
          />
        )}
      </div>
      {children && <div className="v2-toolbar-controls">{children}</div>}
    </div>
  );
}
