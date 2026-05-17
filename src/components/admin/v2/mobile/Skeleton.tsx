"use client";

import type { CSSProperties } from "react";

interface Props {
  /** Width in px or any CSS length. Defaults to 100%. */
  width?: number | string;
  /** Height in px. Defaults to 16. */
  height?: number;
  /** Pill (default 999px) or rectangle (custom radius). */
  radius?: number | "pill";
  /** Tint — lighter on darker surfaces, neutral otherwise. */
  tone?: "default" | "soft";
  style?: CSSProperties;
}

/**
 * Pulse-skeleton placeholder. Matches the final layout's shape so
 * first paint doesn't reflow when data arrives. GPU-friendly: animates
 * `opacity` only (no width/height transitions).
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  tone = "default",
  style,
}: Props) {
  return (
    <span
      aria-hidden
      className="v2-m-skel"
      data-tone={tone}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height,
        borderRadius: radius === "pill" ? 999 : radius,
        ...style,
      }}
    />
  );
}

/** Pre-composed skeleton for a stat card. */
export function StatCardSkeleton() {
  return (
    <div
      style={{
        flex: "0 0 100%",
        scrollSnapAlign: "center",
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--m-card-radius)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 132,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Skeleton width={80} height={11} />
        <Skeleton width={24} height={24} radius={6} />
      </div>
      <Skeleton width="60%" height={28} />
      <Skeleton width={90} height={20} radius="pill" />
    </div>
  );
}

/** Pre-composed skeleton for a list row inside `.v2-m-list`. */
export function ListRowSkeleton() {
  return (
    <div
      className="v2-m-list-row"
      style={{ cursor: "default" }}
    >
      <Skeleton width={36} height={36} radius={10} />
      <span className="v2-m-list-stack" style={{ gap: 6 }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </span>
      <Skeleton width={50} height={14} />
    </div>
  );
}

/** A skeleton list — useful as `empty` while loading. */
export function MobileListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul role="list" className="v2-m-list" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i}>
          <ListRowSkeleton />
        </li>
      ))}
    </ul>
  );
}
