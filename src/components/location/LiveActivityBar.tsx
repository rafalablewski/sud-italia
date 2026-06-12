"use client";

import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
import { getLocation } from "@/data/locations";
import { Flame, Megaphone, MapPin, Sparkles, TrendingUp, Zap } from "lucide-react";

// Real, location-scoped social proof. The stat widgets read live aggregates
// from /api/public/live-activity (computed from actual orders — see
// store.getLiveActivity); the content widgets (happy hour, location, free
// text) are operator-authored in admin Growth → Live activity widgets. The
// previous fabricated `simulateLiveActivity` helper was deleted (Rule #1).
// Styled to the V8 storefront editorial treatment — a parchment band, italic
// Cormorant, basil pip, espresso/oxblood accents — not a dark strip.

type LiveWidgetType =
  | "ordersInLastHour"
  | "currentlyPreparing"
  | "trendingItem"
  | "avgPrepTime"
  | "happyHour"
  | "truckLocation"
  | "freeText";

interface LiveWidget {
  id: string;
  type: LiveWidgetType;
  label?: string;
  active: boolean;
  locationSlugs?: string[];
  order: number;
  config?: { text?: string; endHour?: number; discountPct?: number; category?: string };
}

interface LiveActivitySnapshot {
  ordersInLastHour: number;
  currentlyPreparing: number;
  popularItemNow: string | null;
  avgPrepTimeMinutes: number | null;
}

interface RenderedWidget {
  id: string;
  content: ReactNode;
}

const ICON: CSSProperties = { width: 14, height: 14, flexShrink: 0 };
// Value highlight — espresso, upright, inside the italic-Cormorant band.
function Val({ children, tone = "var(--color-espresso)" }: { children: ReactNode; tone?: string }) {
  return <strong style={{ color: tone, fontStyle: "normal", fontWeight: 600 }}>{children}</strong>;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function renderWidget(
  widget: LiveWidget,
  locationSlug: string,
  activity: LiveActivitySnapshot | null,
): ReactNode | null {
  switch (widget.type) {
    // ── real stat widgets — hidden until live data loads, and skipped
    //    whenever the real value is 0 / null so a quiet location never
    //    shows a sad or invented number. ──
    case "ordersInLastHour":
      if (!activity || activity.ordersInLastHour <= 0) return null;
      return (
        <>
          <span className="relative inline-flex" style={{ width: 8, height: 8 }}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full" style={{ background: "var(--color-basil)", opacity: 0.55 }} />
            <span className="relative inline-flex rounded-full" style={{ width: 8, height: 8, background: "var(--color-basil)" }} />
          </span>
          <span><Val>{activity.ordersInLastHour}</Val> {widget.label ?? "orders in the last hour"}</span>
        </>
      );
    case "currentlyPreparing":
      if (!activity || activity.currentlyPreparing <= 0) return null;
      return (
        <>
          <Flame style={{ ...ICON, color: "var(--color-terracotta)" }} />
          <span><Val>{activity.currentlyPreparing}</Val> {widget.label ?? "orders being prepared"}</span>
        </>
      );
    case "trendingItem":
      if (!activity || !activity.popularItemNow) return null;
      return (
        <>
          <TrendingUp style={{ ...ICON, color: "var(--color-oxblood)" }} />
          <span>{widget.label ?? "Trending"}: <Val tone="var(--color-oxblood)">{activity.popularItemNow}</Val></span>
        </>
      );
    case "avgPrepTime":
      if (!activity || activity.avgPrepTimeMinutes == null) return null;
      return (
        <>
          <Zap style={{ ...ICON, color: "var(--color-terracotta)" }} />
          <span>{widget.label ?? "Avg prep"}: <Val>{activity.avgPrepTimeMinutes} min</Val></span>
        </>
      );
    // ── operator-authored content widgets (already real) ──
    case "happyHour": {
      const pct = widget.config?.discountPct;
      const endHour = widget.config?.endHour;
      if (typeof endHour === "number" && new Date().getHours() >= endHour) return null;
      const body =
        widget.label ??
        (pct
          ? widget.config?.category
            ? `Happy hour: ${pct}% off ${widget.config.category}`
            : `Happy hour: ${pct}% off`
          : "Happy hour");
      return (
        <>
          <Sparkles style={{ ...ICON, color: "var(--color-terracotta)" }} />
          <span>
            <Val>{body}</Val>
            {typeof endHour === "number" && <span style={{ opacity: 0.7 }}> · ends {fmtHour(endHour)}</span>}
          </span>
        </>
      );
    }
    case "truckLocation": {
      const loc = getLocation(locationSlug);
      const address = loc?.address ?? loc?.city ?? locationSlug;
      return (
        <>
          <MapPin style={{ ...ICON, color: "var(--color-terracotta)" }} />
          <span>{widget.label ?? "Find us at"}: <Val>{address}</Val></span>
        </>
      );
    }
    case "freeText": {
      const text = widget.label ?? widget.config?.text;
      if (!text) return null;
      return (
        <>
          <Megaphone style={{ ...ICON, color: "var(--color-muted)" }} />
          <span>{text}</span>
        </>
      );
    }
    default:
      return null;
  }
}

export function LiveActivityBar({ locationSlug }: { locationSlug: string }) {
  const [widgets, setWidgets] = useState<LiveWidget[]>([]);
  const [activity, setActivity] = useState<LiveActivitySnapshot | null>(null);

  // The operator's location-filtered widget list (which signals to show).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/public?location=${encodeURIComponent(locationSlug)}`)
      .then((r) => r.json())
      .then((data: { liveWidgets?: LiveWidget[] }) => {
        if (!cancelled && Array.isArray(data.liveWidgets)) setWidgets(data.liveWidgets);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [locationSlug]);

  // Real live aggregates — fetched on mount, then polled every 30s.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/public/live-activity?location=${encodeURIComponent(locationSlug)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: LiveActivitySnapshot | null) => { if (!cancelled && data) setActivity(data); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [locationSlug]);

  const rendered: RenderedWidget[] = widgets
    .map((w) => ({ id: w.id, content: renderWidget(w, locationSlug, activity) }))
    .filter((r): r is RenderedWidget => r.content !== null);

  if (rendered.length === 0) return null;

  return (
    <div style={{ background: "var(--color-parchment-deep)", borderTop: "1px solid var(--color-line-soft)", borderBottom: "1px solid var(--color-line-soft)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 9, paddingBottom: 9 }}>
        <div
          className="flex items-center gap-5 overflow-x-auto scrollbar-hide"
          style={{ fontFamily: "var(--font-heading)", fontStyle: "italic", color: "var(--color-muted)", fontSize: 14 }}
        >
          {rendered.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2 flex-shrink-0" style={{ whiteSpace: "nowrap" }}>
              {i > 0 && <span aria-hidden style={{ width: 1, height: 14, background: "var(--color-line-soft)", flexShrink: 0, marginLeft: -8, marginRight: 8 }} />}
              {item.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
