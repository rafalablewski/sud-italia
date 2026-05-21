"use client";

import { useEffect, useState } from "react";
import { simulateLiveActivity, type LiveActivity } from "@/lib/growth-engine";
import { getActiveLocations } from "@/data/locations";
import { Bi } from "../Bi";

/**
 * Espresso ticker below the v8 header. Pulls live activity numbers
 * from simulateLiveActivity() (Math.random-based, so render is
 * client-side to avoid hydration mismatch). The primary location's
 * stats stand in for the site-wide ticker.
 */
export function V8LiveTicker() {
  const primary = getActiveLocations()[0];
  const [activity, setActivity] = useState<LiveActivity | null>(null);

  useEffect(() => {
    if (!primary) return;
    const update = () => setActivity(simulateLiveActivity(primary.slug));
    update();
    const id = setInterval(update, 45_000);
    return () => clearInterval(id);
  }, [primary]);

  if (!primary || !activity) return <div className="v8-ticker v8-ticker-skel" aria-hidden="true" />;

  return (
    <div className="v8-ticker" role="status" aria-live="polite">
      <div className="v8-ticker-inner">
        <span className="v8-ticker-stat">
          <span className="v8-pulse-dot" aria-hidden="true" />
          <span>
            <strong className="v8-num">{activity.ordersInLastHour}</strong>{" "}
            <Bi en="orders in the last hour" pl="zamówień w ostatniej godzinie" />
            <span className="v8-it v8-ticker-it">
              · {activity.ordersInLastHour} ordini nell&apos;ultima ora
            </span>
          </span>
        </span>

        <span className="v8-ticker-divider" aria-hidden="true" />

        <span className="v8-ticker-stat">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2 C 5 5, 4 7, 4 9 A 4 4 0 0 0 12 9 C 12 7, 11 5, 8 2 Z"
              stroke="#E6C97A"
              strokeWidth="1.4"
              fill="#C9A23E"
              fillOpacity="0.35"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            <strong className="v8-num">{activity.currentlyPreparing}</strong>{" "}
            <Bi en="in the oven now" pl="w piecu teraz" />
            <span className="v8-it v8-ticker-it">· nel forno ora</span>
          </span>
        </span>

        <span className="v8-ticker-divider" aria-hidden="true" />

        <span className="v8-ticker-stat">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 14 L8 4 M5 7 L8 4 L11 7"
              stroke="#B85C38"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span>
            <Bi en="Trending" pl="Popularne" />:{" "}
            <strong className="v8-it">{activity.popularItemNow}</strong>
            <span className="v8-it v8-ticker-it">· in tendenza</span>
          </span>
        </span>

        <span className="v8-ticker-divider" aria-hidden="true" />

        <span className="v8-ticker-stat">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" stroke="#E6C97A" strokeWidth="1.3" fill="none" />
            <path d="M8 5 L8 8 L10.5 9.5" stroke="#E6C97A" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>
            <Bi en="Avg prep" pl="Średnio" />:{" "}
            <strong className="v8-num">~{activity.avgPrepTimeMinutes} min</strong>
            <span className="v8-it v8-ticker-it">· tempo medio</span>
          </span>
        </span>
      </div>
    </div>
  );
}
