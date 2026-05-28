"use client";

import { useEffect, useState } from "react";
import { simulateLiveActivity, type LiveActivity } from "@/lib/growth-engine";

// V8 Trattoria live ticker — slim espresso-gradient bar that sits
// directly under the top nav. Mirrors the V8 mockup's four-widget
// strip: a pulsing basil dot + "X orders in the last hour", "Y orders
// being prepared", "Trending: <item>", "Avg prep: <min>". Each English
// statline is followed by an italian-italic subtitle on ≥640px.
//
// Data comes from `simulateLiveActivity` (the shared helper that already
// powers <LiveActivityBar /> on /locations/[slug]). On the homepage we
// pass a sentinel "chain" — the helper's locationSlug arg is only a key
// for variance, not a filter — so the numbers feel like the whole brand
// rather than a single truck. Refreshes every 30s, matching the
// location-page cadence.
//
// SSR / hydration: simulateLiveActivity uses Math.random(), so a value
// computed at SSR time would differ from the client's first render and
// trip React 19's hydration check. We render dash placeholders on the
// first pass (server + client agree) and let useEffect compute the
// first real values on mount — the ticker pops in instantly with no
// visible flash.
const refreshMs = 30_000;

const PLACEHOLDER: LiveActivity = {
  ordersInLastHour: 0,
  currentlyPreparing: 0,
  popularItemNow: "—",
  avgPrepTimeMinutes: 0,
};

export function LiveTicker({ locationSlug = "chain" }: { locationSlug?: string }) {
  const [activity, setActivity] = useState<LiveActivity>(PLACEHOLDER);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setActivity(simulateLiveActivity(locationSlug));
    const id = setInterval(() => setActivity(simulateLiveActivity(locationSlug)), refreshMs);
    return () => clearInterval(id);
  }, [locationSlug]);

  // The numeric placeholders ("—") match what SSR rendered; once mounted,
  // we swap to real values. Keep the strip rendered either way so layout
  // doesn't jump.
  const num = (n: number) => (mounted ? String(n) : "—");
  const minutes = (n: number) => (mounted ? `${n} min` : "—");

  return (
    <div className="v8-live-ticker" aria-label="Live restaurant activity">
      <div className="v8-live-ticker-inner max-w-[1500px] mx-auto flex items-center gap-[22px] md:gap-[28px] px-[18px] md:px-[36px] py-[9px] md:py-[10px] overflow-x-auto">
        <Stat>
          <span className="v8-live-pulse" aria-hidden />
          <PeopleIcon />
          <span>
            <strong className="num">{num(activity.ordersInLastHour)}</strong>{" "}
            <span className="v8-live-en">orders in the last hour</span>
            <span className="v8-live-it">· nell&apos;ultima ora</span>
          </span>
        </Stat>
        <Divider />
        <Stat>
          <FlameIcon />
          <span>
            <strong className="num">{num(activity.currentlyPreparing)}</strong>{" "}
            <span className="v8-live-en">orders being prepared</span>
            <span className="v8-live-it">· in preparazione</span>
          </span>
        </Stat>
        <Divider />
        <Stat>
          <TrendingIcon />
          <span>
            Trending<span className="v8-live-it">· in tendenza</span>:{" "}
            <strong>{mounted ? activity.popularItemNow : "—"}</strong>
          </span>
        </Stat>
        <Divider />
        <Stat>
          <BoltIcon />
          <span>
            Avg prep<span className="v8-live-it">· tempo medio</span>:{" "}
            <strong className="num">{minutes(activity.avgPrepTimeMinutes)}</strong>
          </span>
        </Stat>
      </div>
    </div>
  );
}

function Stat({ children }: { children: React.ReactNode }) {
  return <span className="v8-live-stat inline-flex items-center gap-[8px] whitespace-nowrap shrink-0">{children}</span>;
}

function Divider() {
  return <span className="v8-live-divider" aria-hidden />;
}

// V8's hand-tuned ochre SVGs — kept inline so the markup matches the
// mockup 1:1 (the lucide-react icons in the old LiveActivityBar were
// stroke-only and didn't carry the basil/ochre/oxblood fills V8 uses).
function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="2.6" stroke="#C9A23E" strokeWidth="1.4" fill="rgba(201,162,62,0.18)" />
      <circle cx="13.5" cy="6.5" r="2.6" stroke="#C9A23E" strokeWidth="1.4" fill="rgba(201,162,62,0.18)" />
      <path d="M2 17 C 2 14, 4 12, 6.5 12 C 9 12, 11 14, 11 17" stroke="#C9A23E" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M9 17 C 9 14, 11 12, 13.5 12 C 16 12, 18 14, 18 17" stroke="#C9A23E" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 18 C 6 18, 4 15, 4 12 C 4 9, 6 7, 7 6 C 7 9, 9 8, 9 6 C 9 4, 11 3, 12 2 C 12 5, 16 6, 16 12 C 16 15, 14 18, 10 18 Z" stroke="#CD212A" strokeWidth="1.4" fill="rgba(205,33,42,0.25)" />
      <path d="M10 16 C 8 16, 7 14, 8 12 C 9 11, 11 11, 11 9 C 12 11, 13 12, 12 14 C 12 15, 11 16, 10 16 Z" fill="#E6C97A" fillOpacity="0.55" />
    </svg>
  );
}

function TrendingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3 13 L8 8 L11 11 L17 5" stroke="#4A7C59" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 5 L17 5 L17 9" stroke="#4A7C59" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M11 2 L4 12 L9 12 L8 18 L16 7 L11 7 Z" stroke="#C9A23E" strokeWidth="1.4" fill="rgba(201,162,62,0.4)" strokeLinejoin="round" />
    </svg>
  );
}
