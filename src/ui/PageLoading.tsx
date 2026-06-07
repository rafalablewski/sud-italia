"use client";

import type { ReactNode } from "react";

interface Props {
  /**
   * The page name — rendered as "Loading {name}…". Omit for a bare "Loading…".
   * Pass a full `ReactNode` to override the composed copy entirely.
   */
  name?: ReactNode;
  /**
   * Drop the `.v2-page` wrapper. Use ONLY when the page chrome already renders
   * (the "alongside content → conditional child" pattern). When this component
   * is a page's SOLE render, leave `inline` off so it wraps in `.v2-page` and
   * the fixed pill anchors correctly on mobile (the mobile-pill trap, Rule #4 /
   * components.md → Loading states).
   */
  inline?: boolean;
}

/**
 * The one loading state for every admin page. Replaces the hand-written
 * `<div className="v2-page-loading">Loading X…</div>` early-returns that drifted
 * across the suite (some said bare "Loading…", some forgot the `.v2-page` wrap).
 *
 * - Sole render → `<PageLoading name="Orders" />` (wraps in `.v2-page`).
 * - Alongside content → `{loading && <PageLoading name="Orders" inline />}`.
 *
 * See `docs/design-system/admin/theme/components.md` → Loading states.
 */
export function PageLoading({ name, inline = false }: Props) {
  const pill = (
    <div className="v2-page-loading" role="status" aria-live="polite">
      {name === undefined ? "Loading…" : typeof name === "string" ? `Loading ${name}…` : name}
    </div>
  );
  if (inline) return pill;
  return <div className="v2-page">{pill}</div>;
}
