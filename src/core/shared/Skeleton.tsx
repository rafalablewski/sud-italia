import type { CSSProperties } from "react";

/**
 * Core's loading-skeleton primitive — the shimmer placeholder the client-fetched
 * surfaces (CRM · Loyalty · Inbox · Slots · Book) show while their data lands.
 * It replaces the bare `<div className="pane-msg">Loading…</div>` text so a fetch
 * reads as the *shape of the content arriving*, not a dead label — the difference
 * between "slow" and "fast" is mostly this.
 *
 * Shared across every Core surface (one shimmer language for the whole suite).
 * The shimmer + colours live in the Core theme — `.core-suite .skel*` in
 * `src/app/themes/core/suite.css`. No hooks, no server imports: safe to drop
 * into any "use client" surface.
 */

/** A single shimmer block. `w`/`h`/`r` are inline so callers shape it to
 *  whatever it stands in for (a name, a number, an avatar). */
export function Skeleton({
  w,
  h,
  r,
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className ? `skel ${className}` : "skel"}
      style={{ display: "block", width: w, height: h, borderRadius: r, ...style }}
      aria-hidden
    />
  );
}

/** Table-shaped skeleton: `rows` shimmer rows on the same 48px grid as `.tbl`,
 *  with columns sized by `cols` (numbers → `fr` ratios, strings used verbatim)
 *  so the placeholder lines up with the real table that replaces it. */
export function SkeletonTable({
  rows = 8,
  cols,
}: {
  rows?: number;
  cols: (number | string)[];
}) {
  const template = cols.map((c) => (typeof c === "number" ? `${c}fr` : c)).join(" ");
  return (
    <div className="skel-tbl" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-row" key={i} style={{ gridTemplateColumns: template }}>
          {cols.map((_, j) => (
            <Skeleton key={j} h={11} w={j === 0 ? "62%" : "74%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Vertical-list skeleton (inbox threads, wallets, redemptions, bookings):
 *  `rows` two-line entries, with an optional leading avatar circle. */
export function SkeletonList({
  rows = 6,
  avatar = false,
}: {
  rows?: number;
  avatar?: boolean;
}) {
  return (
    <div className="skel-list" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-li" key={i}>
          {avatar && <Skeleton w={34} h={34} r={999} />}
          <div style={{ flex: 1, display: "grid", gap: 7 }}>
            <Skeleton h={11} w="46%" />
            <Skeleton h={10} w="72%" />
          </div>
        </div>
      ))}
    </div>
  );
}
