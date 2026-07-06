"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CORE_SURFACES } from "@/core/routes";

/**
 * The Lens Rail — the left, icon-only rail (60px) that switches how you view the
 * room, not which app you're in. The three Service OS lenses, in spec order:
 * Tables (the plan) · POS (the till / ordering) · KDS (the pass). We keep the
 * **old, plain names** (POS / KDS) rather than "Line"/"Pass" — operators know
 * them. Book (slots / reservations) is a **Service** view (a tab under the
 * Tables lens, alongside Slots · Dispatch), not its own lens.
 *
 * The rail is collapsed to icons by default and expands to reveal labels only
 * when the operator **pins** it (a click on the pin toggle) — never on hover, so
 * a stray brush of the cursor never shoves the Canvas. The pinned choice
 * persists across surfaces (localStorage). The selected entity persists across
 * every lens (SelectionContext + CoreDock), so switching lens re-renders the
 * SAME selection.
 *
 * Guest is a lens too — its own hub (Inbox · CRM · Loyalty · Concierge).
 * Orders stays a cross-cutting surface (not a room lens) — reached from the
 * Command Bar's ⌘K ("the tiramisu order", "Kowalski"). Active state is derived
 * from the pathname; hrefs come from @/core/routes.
 *
 * The rail owns the `.core-lens` class (distinct from the POS category
 * `.core-rail`) — see docs/design-system/core/theme/README.md → "Chrome".
 */

// Icons trace the dense-console mockup's lens rail 1:1 (tests/sketches/
// core-pages/*.html → `.lens`): Tables = 2×2 grid, POS = register with legs,
// KDS = split pass panel, Guest = two people, Reports = line chart,
// Settings = gear.
const ICON: Record<string, ReactNode> = {
  service: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  pos: (
    <>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M2 10h20M7 18v3M17 18v3" />
    </>
  ),
  kds: <path d="M4 4h16v5H4zM4 13h16v7H4zM8 4v5M16 13v7" />,
  guest: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  reports: <path d="M3 3v18h18M7 14l3-4 3 3 5-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3.9a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.3.9 2-3.4-2-1.5a7 7 0 0 0 .1-1z" />
    </>
  ),
};

// The room lenses, in rail order. Labels are the plain names. Book is not a lens
// (it's a Service view, reached from the Tables lens tabs); Guest IS a lens —
// its own hub of Inbox · CRM · Loyalty · Concierge.
const LENSES: { key: keyof typeof ICON; href: string; label: string; sub: string }[] = [
  { key: "service", href: CORE_SURFACES.book, label: "Book", sub: "reservations · tables" },
  { key: "pos", href: CORE_SURFACES.pos, label: "POS", sub: "order & charge" },
  { key: "kds", href: CORE_SURFACES.kds, label: "KDS", sub: "kitchen wall" },
  { key: "guest", href: CORE_SURFACES.guest, label: "Guest", sub: "inbox · crm" },
];
// Below the divider — the two ops adjacencies the mockup rail pins (they live
// in the admin shell, so these leave the Core canvas by design).
const ADJACENCIES: { key: keyof typeof ICON; href: string; label: string; sub: string }[] = [
  { key: "reports", href: "/admin/reports", label: "Reports", sub: "day close" },
  { key: "settings", href: "/admin/settings", label: "Settings", sub: "device · tax" },
];

const PIN_KEY = "core-lens-pinned";

export function CoreNav() {
  const pathname = usePathname() ?? "";
  // Collapsed (icon-only) by default; the pinned choice is restored on mount so
  // it survives navigation between surfaces (the rail remounts per page).
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === "1");
    } catch {
      /* private mode — non-fatal, stays collapsed */
    }
  }, []);

  const toggle = () => {
    setPinned((v) => {
      const next = !v;
      try {
        localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {
        /* private mode — non-fatal */
      }
      return next;
    });
  };

  return (
    <nav className={pinned ? "core-lens open" : "core-lens"} aria-label="Lenses">
      <button
        type="button"
        className="core-lens-pin"
        aria-pressed={pinned}
        aria-label={pinned ? "Collapse the lens rail" : "Pin the lens rail open"}
        title={pinned ? "Collapse" : "Pin open"}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M9 4v16M4 8h5M15 4l5 8-5 8" />
        </svg>
        <span>Lenses</span>
      </button>
      {LENSES.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.key}
            href={s.href}
            className={active ? "on" : undefined}
            aria-current={active ? "page" : undefined}
            aria-label={s.label}
            title={s.label}
          >
            <span className="core-lens-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                {ICON[s.key]}
              </svg>
            </span>
            <span className="core-lens-txt">{s.label}<span className="core-lens-sub">{s.sub}</span></span>
          </Link>
        );
      })}
      <div className="core-lens-div" />
      {ADJACENCIES.map((s) => (
        <Link key={s.key} href={s.href} aria-label={s.label} title={s.label}>
          <span className="core-lens-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              {ICON[s.key]}
            </svg>
          </span>
          <span className="core-lens-txt">{s.label}<span className="core-lens-sub">{s.sub}</span></span>
        </Link>
      ))}
    </nav>
  );
}
