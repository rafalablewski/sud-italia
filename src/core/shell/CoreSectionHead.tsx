import type { ReactNode } from "react";

/**
 * The surface page-head every Core surface renders directly under its
 * {@link CoreCrumb}, with a FIXED grammar:
 *
 *   {SECTION} · {PAGE}   [sub]   ·····spacer·····   [actions]
 *
 * Same discipline as `CoreCrumb`, one row down. The title row was hand-rolled
 * on every surface, so the "· " title separator, the grotesk `<h1>` element and
 * the uppercase-mono `.sub` styling could drift, and the right-aligned
 * view/scope switch (Book's lenses, and the switches Slots/Loyalty push to a
 * separate row today) had no single home. Centralising the row here means a
 * surface passes only `section`, the optional `page`, the `sub`, and any
 * right-aligned `actions` — the component renders the same `.core-sectionhead`
 * DOM (theme `theme/README.md` → `.core-sectionhead`), so it is a pure refactor
 * of the markup.
 */
export function CoreSectionHead({
  section,
  page,
  sub,
  actions,
  as: Title = "h1",
}: {
  /** Title-case surface family, e.g. `Service`, `Guest`, `POS`, `Orders`. */
  section: string;
  /** Title-case page within the surface, e.g. `Tables`. Omit for single-page surfaces (Orders). */
  page?: string;
  /** The uppercase-mono `.sub` line under the title. */
  sub?: ReactNode;
  /** Right-aligned controls (a view/scope switch) — pinned to the row's end via `.core-sp`. */
  actions?: ReactNode;
  /** Heading level for the title (default `h1`). */
  as?: "h1" | "h2";
}) {
  return (
    <div className="core-sectionhead">
      <Title>{page ? `${section} · ${page}` : section}</Title>
      {sub != null && <span className="sub">{sub}</span>}
      {actions != null && (
        <>
          <div className="core-sp" />
          {actions}
        </>
      )}
    </div>
  );
}
