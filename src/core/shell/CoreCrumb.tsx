import type { ReactNode } from "react";

/**
 * The one breadcrumb every Core surface renders, with a FIXED grammar:
 *
 *   CORE — {SECTION} · {PAGE} · liquid glass · [{mode}]
 *
 * The green (`<b>`) theme-token slot is ALWAYS "liquid glass" — a surface may
 * only vary SECTION, the optional PAGE, and the bracketed `.fix` MODE pill.
 * Centralising the line here stops the per-surface drift the toolbar/section
 * audit found: `slots`/`crm`/`inbox`/`concierge` had put mode text in the
 * theme slot, and `slots`/`book`/`kds:floor` mis-ordered section·page. With
 * one component the theme token can never fall out of the green slot again.
 *
 * Renders the same `.core-crumb` DOM the surfaces wrote by hand (theme
 * `theme/README.md` → `.core-crumb`), so it is a pure refactor of the markup.
 */
export function CoreCrumb({
  section,
  page,
  mode,
}: {
  /** Uppercase surface family, e.g. `SERVICE`, `KDS`, `GUEST`, `POS`. */
  section: string;
  /** Uppercase page within the surface, e.g. `TABLES`. Omit for single-page surfaces (Orders). */
  page?: string;
  /** The bracketed context/mode pill (`.fix`) — the only free-form slot. */
  mode: ReactNode;
}) {
  return (
    <div className="core-crumb">
      {`CORE — ${section}${page ? ` · ${page}` : ""} · `}
      <b>liquid glass</b>
      {" · "}
      <span className="fix">{mode}</span>
    </div>
  );
}
