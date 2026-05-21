"use client";

import { useEffect, useState } from "react";
import { simulateLiveActivity, type LiveActivity } from "@/lib/growth-engine";
import { getActiveLocations } from "@/data/locations";
import { Bi } from "../Bi";

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="2.6" stroke="#88B196" strokeWidth="1.4" fill="none" />
      <circle cx="13" cy="6.5" r="2.2" stroke="#88B196" strokeWidth="1.4" fill="none" />
      <path d="M1.5 15 C 1.5 11.5, 4 10, 6 10 C 8 10, 10.5 11.5, 10.5 15" stroke="#88B196" strokeWidth="1.4" fill="none" />
      <path d="M9.5 15 C 9.5 12, 11.5 11, 13 11 C 14.5 11, 16.5 12, 16.5 15" stroke="#88B196" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 16 C 5 16, 3 13, 3 10.5 C 3 8.5, 4.5 6.5, 6 5 C 6 7, 7.5 7.5, 9 6 C 9 4, 8.5 2.5, 10.5 1.5 C 10.5 4.5, 14 6, 14 10.5 C 14 13.5, 12.5 16, 9 16 Z"
        stroke="#D88E6E"
        strokeWidth="1.3"
        fill="#CD212A"
        fillOpacity="0.45"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M2 13 L7 8 L10 11 L16 5"
        stroke="#E6C97A"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M11 5 L16 5 L16 10" stroke="#E6C97A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M10 1 L3.5 10 L8 10 L8 17 L14.5 8 L10 8 Z"
        stroke="#E6C97A"
        strokeWidth="1.4"
        fill="#C9A23E"
        fillOpacity="0.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Espresso ticker below the v8 header. Pulls live activity from
 * simulateLiveActivity() (Math.random-based, hence client-rendered).
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

  if (!primary) return null;
  if (!activity) {
    return <div className="v8-ticker v8-ticker-skel" aria-hidden="true" />;
  }

  return (
    <div className="v8-ticker" role="status" aria-live="polite">
      <div className="v8-ticker-inner">
        <span className="v8-ticker-stat">
          <UsersIcon />
          <span>
            <strong className="v8-num">{activity.ordersInLastHour}</strong>{" "}
            <Bi en="orders in the last hour" pl="zamówień w ostatniej godzinie" />
            <span className="v8-it v8-ticker-it"> · nell&apos;ultima ora</span>
          </span>
        </span>

        <span className="v8-ticker-divider" aria-hidden="true" />

        <span className="v8-ticker-stat">
          <FlameIcon />
          <span>
            <strong className="v8-num">{activity.currentlyPreparing}</strong>{" "}
            <Bi en="orders being prepared" pl="zamówień w przygotowaniu" />
            <span className="v8-it v8-ticker-it"> · in preparazione</span>
          </span>
        </span>

        <span className="v8-ticker-divider" aria-hidden="true" />

        <span className="v8-ticker-stat">
          <TrendingIcon />
          <span>
            <strong>
              <Bi en="Trending" pl="Popularne" />
            </strong>
            <span className="v8-it v8-ticker-it"> · in tendenza</span>:{" "}
            <span className="v8-it">{activity.popularItemNow}</span>
          </span>
        </span>

        <span className="v8-ticker-divider" aria-hidden="true" />

        <span className="v8-ticker-stat">
          <ZapIcon />
          <span>
            <strong>
              <Bi en="Avg prep" pl="Średnio" />
            </strong>
            <span className="v8-it v8-ticker-it"> · tempo medio</span>:{" "}
            <strong className="v8-num">{activity.avgPrepTimeMinutes} min</strong>
          </span>
        </span>
      </div>
    </div>
  );
}
