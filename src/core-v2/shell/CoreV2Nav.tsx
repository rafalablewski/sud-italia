"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Core v2 primary surface switcher — the four surfaces the truck runs on,
 * rendered as a segmented pill in the command bar. Core v2 is a separate
 * entity from /admin: this is its own switcher (no admin nav.config, no
 * sidebar). Active state is derived from the pathname. Line glyphs are
 * inlined (POS terminal · KDS screen · guest · service cloche) — not lucide.
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

const SURFACES: { key: keyof typeof ICON; href: string; label: string }[] = [
  { key: "pos", href: "/core-v2/pos", label: "POS" },
  { key: "kds", href: "/core-v2/kds", label: "KDS" },
  { key: "guest", href: "/core-v2/guest", label: "Guest" },
  { key: "service", href: "/core-v2/service", label: "Service" },
];

export function CoreV2Nav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="cv-switch" aria-label="Core surfaces">
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
