"use client";

import { Info, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { Popover } from "./Popover";

interface Props {
  /** Page title — serif display, the only h1 on the page. */
  title: ReactNode;
  /**
   * Optional help — rendered behind a quiet ⓘ trigger that opens a Popover.
   * This REPLACES the old always-on subtitle (which ate vertical space): page
   * description / "how to read this" copy lives here, one click away. NB: this
   * is page-level help, NOT a metric ⓘ — those still use `InfoButton` +
   * `MetricExplainer` (Rule #12).
   */
  info?: ReactNode;
  /**
   * The single primary action for the view — a labelled `<Button variant="primary">`.
   * One per view (the action language, blueprint §3.1). Never icon-only.
   */
  primaryAction?: ReactNode;
  /**
   * Secondary / low-frequency actions, collapsed under a `⋯` overflow menu so the
   * header stays to one visible CTA. Render menu rows (e.g. `<button className="v2-menu-item">`).
   */
  menu?: ReactNode | ((close: () => void) => ReactNode);
  /** Optional leading slot — a back link on detail pages. */
  back?: ReactNode;
}

/**
 * The **identity** half of the command surface (blueprint §4). A slim, panel-less
 * bar that states *where you are* and offers *the one action* — nothing else.
 * Location lives in the shell scope, not here; filters/navigation live in
 * `ViewToolbar`, not here. This deliberately replaces the heavy platinum-railed
 * `PageHero` panel (which merged identity + control and stacked three switcher
 * idioms). See `docs/design-system/admin/theme/components.md` → Page header.
 */
export function PageHeader({ title, info, primaryAction, menu, back }: Props) {
  return (
    <header className="v2-pagehead">
      <div className="v2-pagehead-id">
        {back && <div className="v2-pagehead-back">{back}</div>}
        <h1 className="v2-pagehead-title">{title}</h1>
        {info && (
          <Popover
            placement="bottom-start"
            trigger={
              <IconButton size="sm" label="About this page" className="v2-pagehead-info">
                <Info className="h-3.5 w-3.5" />
              </IconButton>
            }
          >
            <div className="v2-pagehead-help">{info}</div>
          </Popover>
        )}
      </div>

      {(primaryAction || menu) && (
        <div className="v2-pagehead-actions">
          {primaryAction}
          {menu && (
            <Popover
              placement="bottom-end"
              trigger={
                <IconButton label="More actions" className="v2-pagehead-more">
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              }
            >
              {(close) => (
                <div className="v2-menu" role="menu">
                  {typeof menu === "function" ? menu(close) : menu}
                </div>
              )}
            </Popover>
          )}
        </div>
      )}
    </header>
  );
}
