import type { ReactNode } from "react";

/**
 * Core v2 · Guest — header action glyphs. Core v2 draws its **own** line
 * icons (24-grid, currentColor, 1.8 stroke) rather than pulling lucide, so the
 * guest headers (Inbox actions, Loyalty view-switcher) can read as compact
 * icon-only controls without a new dependency. Each glyph is paired with a
 * `title` + `aria-label` on its button so the dropped text stays accessible.
 */

const PATHS: Record<string, ReactNode> = {
  // Inbox actions
  funnel: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  broadcast: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h9" />
      <path d="M17 6h3" />
      <circle cx="15" cy="6" r="2" />
      <path d="M4 12h3" />
      <path d="M11 12h9" />
      <circle cx="9" cy="12" r="2" />
      <path d="M4 18h9" />
      <path d="M17 18h3" />
      <circle cx="15" cy="18" r="2" />
    </>
  ),
  // Loyalty view tabs
  members: (
    <>
      <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M21 19v-1a4 4 0 0 0-3-3.87" />
    </>
  ),
  wallets: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.1" />
    </>
  ),
  redemptions: (
    <>
      <rect x="3" y="9" width="18" height="11" rx="1.5" />
      <path d="M3 13h18" />
      <path d="M12 9v11" />
      <path d="M12 9c-1-3-5.5-2.6-5.5-.4C6.5 10 9 9.4 12 9Z" />
      <path d="M12 9c1-3 5.5-2.6 5.5-.4C17.5 10 15 9.4 12 9Z" />
    </>
  ),
  winback: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4v4h4" />
    </>
  ),
  // Loyalty members filter bar
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  // tier "All" — a layered stack (distinct from the per-tier gem)
  tierAll: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  // a faceted gem, tinted per tier by the button's color
  gem: (
    <>
      <path d="M6 4h12l3 5-9 11L3 9 6 4Z" />
      <path d="M3 9h18" />
      <path d="M9 4 8 9l4 11 4-11-1-5" />
    </>
  ),
  // sort keys
  points: <path d="m12 3.5 2.6 5.7 6.2.6-4.7 4.2 1.4 6.1L12 17l-5.5 3.1 1.4-6.1L3.2 9.8l6.2-.6L12 3.5Z" />,
  spent: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  orders: (
    <>
      <path d="M6.5 8h11l-1 11.5a1 1 0 0 1-1 .9H8.5a1 1 0 0 1-1-.9L6.5 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  name: (
    <>
      <path d="M4 7h7" />
      <path d="M4 12h5" />
      <path d="M4 17h3" />
      <path d="M15 5v13" />
      <path d="m12 15 3 3 3-3" />
    </>
  ),
  // Inbox conversation filters
  inbox: (
    <>
      <path d="M4 13 6.5 5h11L20 13" />
      <path d="M4 13h4l1.5 3h5L16 13h4v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" />
    </>
  ),
  live: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M16.5 7.5a6 6 0 0 1 0 9" />
      <path d="M7.5 16.5a6 6 0 0 1 0-9" />
    </>
  ),
  awaiting: (
    <>
      <path d="M7 4h10" />
      <path d="M7 20h10" />
      <path d="M7 4c0 4 5 5 5 8s-5 4-5 8" />
      <path d="M17 4c0 4-5 5-5 8s5 4 5 8" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
      <path d="M10 12h4" />
    </>
  ),
  // CRM segment categories
  crown: <path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7Z" />,
  badge: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.4 8 21l4-2 4 2-1-7.6" />
    </>
  ),
  activity: <path d="M3 12h4l2.5 7 5-14L17 12h4" />,
  repeat: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="M19 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7 .7-2Z" />
    </>
  ),
  userx: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21v-1a5 5 0 0 1 5-5h4" />
      <path d="M16 16l5 5" />
      <path d="M21 16l-5 5" />
    </>
  ),
  // CRM sorts + channels + recency
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  utensils: (
    <>
      <path d="M5 3v6a2 2 0 0 0 4 0V3" />
      <path d="M7 9v12" />
      <path d="M17 3c-2 0-3 2-3 5s1 4 3 4v9" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  takeout: (
    <>
      <path d="M6 8h12l-1.4 12H7.4z" />
      <path d="M5 8h14" />
      <path d="M9 4h6l1 4H8z" />
    </>
  ),
  chat: <path d="M4 5h16v11H8l-4 4V5Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.7 2.6 14.3 0 17" />
      <path d="M12 3.5c-2.6 2.7-2.6 14.3 0 17" />
    </>
  ),
  asterisk: (
    <>
      <path d="M12 4v16" />
      <path d="M4 8l16 8" />
      <path d="M20 8 4 16" />
    </>
  ),
  anytime: (
    <>
      <circle cx="8" cy="12" r="3.4" />
      <circle cx="16" cy="12" r="3.4" />
    </>
  ),
  calWeek: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M7 14h6" />
    </>
  ),
  calMonth: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M7 13h.01" />
      <path d="M11 13h.01" />
      <path d="M15 13h.01" />
      <path d="M7 17h.01" />
      <path d="M11 17h.01" />
    </>
  ),
};

export type GuestGlyphName = keyof typeof PATHS;

export function GuestGlyph({ name }: { name: GuestGlyphName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
