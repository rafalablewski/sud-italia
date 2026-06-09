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
};

export type GuestGlyphName = keyof typeof PATHS;

export function GuestGlyph({ name }: { name: GuestGlyphName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
