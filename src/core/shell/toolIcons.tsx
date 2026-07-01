/**
 * Shared command-bar tool icons — one consistent 24-viewBox, 1.6-weight line
 * set for the surface tools that live in the "Command" bar (`.cm-surf`), so QR,
 * fullscreen and refresh render identically across POS / KDS / Orders / Service
 * instead of a mix of unicode glyphs and pills. Matches the "14 — Command"
 * mockup icon set. Pure SVG (no hooks) — safe in server or client components.
 * Colour + sizing come from the `.core-iconbtn` chrome (currentColor, 16px).
 */
import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

/** QR table-orders launcher. */
export function QrIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M17 20h0M20 14v3M20 20v0" />
    </svg>
  );
}

/** Enter / exit fullscreen kiosk. */
export function ExpandIcon() {
  return (
    <svg {...base}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** Refresh / reload the surface. */
export function RefreshIcon() {
  return (
    <svg {...base}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
    </svg>
  );
}

/** Sound on (chime) / muted — KDS new-ticket chime toggle. */
export function SoundIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg {...base}>
      <path d="M11 5 6 9H3v6h3l5 4Z" />
      {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M16 9a4 4 0 0 1 0 6M19 7a7 7 0 0 1 0 10" />}
    </svg>
  );
}

/** Play / pause — KDS board auto-refresh toggle. */
export function PauseIcon({ paused = false }: { paused?: boolean }) {
  return (
    <svg {...base}>
      {paused ? <path d="M7 4l13 8-13 8Z" /> : <path d="M9 4H7v16h2ZM17 4h-2v16h2Z" />}
    </svg>
  );
}
