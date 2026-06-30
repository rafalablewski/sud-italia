"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CORE_SURFACES } from "@/core/routes";

/**
 * Core primary surface switcher — the five surfaces the truck runs on,
 * rendered as a segmented pill in the command bar. Core is a separate entity
 * from /admin: this is its own switcher (no admin nav.config, no sidebar).
 * Active state is derived from the pathname. Hrefs come from the single
 * route source (@/core/routes). Line glyphs are inlined (POS terminal · KDS
 * screen · order · guest · service cloche) — not lucide.
 */

const ICON: Record<string, ReactNode> = {
  pos: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  kds: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h6" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3h12a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-2-2-2 2V4a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  guest: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  service: (
    <>
      <path d="M3 11a9 9 0 0 1 18 0Z" />
      <path d="M12 2v3M2 16h20M5 20h14" />
    </>
  ),
};

// Floor leads — it's Core's home base (tap a table → its check opens over the
// floor). POS stays as the standalone till; KDS is the kitchen lens; Guest the
// relationship surface.
const SURFACES: { key: keyof typeof ICON; href: string; label: string }[] = [
  { key: "service", href: CORE_SURFACES.service, label: "Floor" },
  { key: "pos", href: CORE_SURFACES.pos, label: "POS" },
  { key: "kds", href: CORE_SURFACES.kds, label: "KDS" },
  { key: "orders", href: CORE_SURFACES.orders, label: "Orders" },
  { key: "guest", href: CORE_SURFACES.guest, label: "Guest" },
];

export function CoreNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="core-switch" aria-label="Core surfaces">
      {SURFACES.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link key={s.key} href={s.href} className={active ? "on" : undefined} aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              {ICON[s.key]}
            </svg>
            <span>{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
