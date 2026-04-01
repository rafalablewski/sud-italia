"use client";

import { useState, useEffect } from "react";
import { simulateLiveActivity } from "@/lib/growth-engine";

interface MenuFomoMicroLineProps {
  locationSlug: string;
}

/**
 * One-line social proof / seasonal FOMO in the sticky menu header.
 * Seasonal count from public settings; otherwise same signals as LiveActivityBar.
 */
export function MenuFomoMicroLine({ locationSlug }: MenuFomoMicroLineProps) {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/public?location=${encodeURIComponent(locationSlug)}`)
      .then((r) => r.json())
      .then((data: { seasonalItems?: unknown[] }) => {
        if (cancelled) return;
        const seasonal = Array.isArray(data.seasonalItems)
          ? data.seasonalItems.length
          : 0;
        if (seasonal > 0) {
          setLine(
            seasonal === 1
              ? "1 limited-time special below — grab it before it rotates off."
              : `${seasonal} limited-time specials below — they will not stay forever.`
          );
          return;
        }
        const act = simulateLiveActivity(locationSlug);
        setLine(
          `${act.ordersInLastHour} orders in the last hour · Trending: ${act.popularItemNow}`
        );
      })
      .catch(() => {
        if (!cancelled) setLine(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locationSlug]);

  if (!line) return null;

  return (
    <p className="text-[11px] text-italia-gray mb-2 flex items-center gap-2 leading-snug">
      <span
        className="inline-flex h-1.5 w-1.5 rounded-full bg-italia-red/70 animate-pulse flex-shrink-0"
        aria-hidden
      />
      <span>{line}</span>
    </p>
  );
}
