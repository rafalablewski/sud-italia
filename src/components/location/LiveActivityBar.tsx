"use client";

import { useState, useEffect, type ReactNode } from "react";
import { simulateLiveActivity } from "@/lib/growth-engine";
import { getLocation } from "@/data/locations";
import {
  Flame,
  Megaphone,
  MapPin,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

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
  config?: {
    text?: string;
    endHour?: number;
    discountPct?: number;
    category?: string;
  };
}

interface LiveActivityBarProps {
  locationSlug: string;
}

interface RenderedWidget {
  id: string;
  content: ReactNode;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function renderWidget(
  widget: LiveWidget,
  locationSlug: string,
  activity: ReturnType<typeof simulateLiveActivity>,
): ReactNode | null {
  switch (widget.type) {
    case "ordersInLastHour":
      return (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          <Users className="h-3.5 w-3.5 text-green-400" />
          <span className="text-white/90 whitespace-nowrap">
            <strong>{activity.ordersInLastHour}</strong>{" "}
            {widget.label ?? "orders in the last hour"}
          </span>
        </>
      );
    case "currentlyPreparing":
      return (
        <>
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-white/80 whitespace-nowrap">
            <strong>{activity.currentlyPreparing}</strong>{" "}
            {widget.label ?? "orders being prepared"}
          </span>
        </>
      );
    case "trendingItem":
      return (
        <>
          <TrendingUp className="h-3.5 w-3.5 text-italia-gold" />
          <span className="text-white/80 whitespace-nowrap">
            {widget.label ?? "Trending"}: <strong>{activity.popularItemNow}</strong>
          </span>
        </>
      );
    case "avgPrepTime":
      return (
        <>
          <Zap className="h-3.5 w-3.5 text-yellow-400" />
          <span className="text-white/80 whitespace-nowrap">
            {widget.label ?? "Avg prep"}:{" "}
            <strong>{activity.avgPrepTimeMinutes} min</strong>
          </span>
        </>
      );
    case "happyHour": {
      const pct = widget.config?.discountPct;
      const endHour = widget.config?.endHour;
      // Auto-hide once the configured end-hour has passed.
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
          <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
          <span className="text-white/85 whitespace-nowrap">
            <strong>{body}</strong>
            {typeof endHour === "number" && (
              <span className="text-white/60"> · ends {fmtHour(endHour)}</span>
            )}
          </span>
        </>
      );
    }
    case "truckLocation": {
      const loc = getLocation(locationSlug);
      const address = loc?.address ?? loc?.city ?? locationSlug;
      return (
        <>
          <MapPin className="h-3.5 w-3.5 text-italia-red" />
          <span className="text-white/80 whitespace-nowrap">
            {widget.label ?? "Truck is at"}: <strong>{address}</strong>
          </span>
        </>
      );
    }
    case "freeText": {
      const text = widget.label ?? widget.config?.text;
      if (!text) return null;
      return (
        <>
          <Megaphone className="h-3.5 w-3.5 text-blue-300" />
          <span className="text-white/85 whitespace-nowrap">{text}</span>
        </>
      );
    }
    default:
      return null;
  }
}

export function LiveActivityBar({ locationSlug }: LiveActivityBarProps) {
  const [activity, setActivity] = useState(() => simulateLiveActivity(locationSlug));
  const [widgets, setWidgets] = useState<LiveWidget[]>([]);

  // Fetch the location-filtered widget list from public settings.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/public?location=${encodeURIComponent(locationSlug)}`)
      .then((r) => r.json())
      .then((data: { liveWidgets?: LiveWidget[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.liveWidgets)) setWidgets(data.liveWidgets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locationSlug]);

  // Refresh activity data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActivity(simulateLiveActivity(locationSlug));
    }, 30000);
    return () => clearInterval(interval);
  }, [locationSlug]);

  const rendered: RenderedWidget[] = widgets
    .map((w) => ({ id: w.id, content: renderWidget(w, locationSlug, activity) }))
    .filter((r): r is RenderedWidget => r.content !== null);

  if (rendered.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-italia-dark to-[#2a1a0a] text-white py-2.5 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide text-sm">
          {rendered.map((item, i) => (
            <div key={item.id} className="flex items-center gap-1.5 flex-shrink-0">
              {i > 0 && <div className="w-px h-4 bg-white/15 -ml-3 mr-3 flex-shrink-0" aria-hidden />}
              {item.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
