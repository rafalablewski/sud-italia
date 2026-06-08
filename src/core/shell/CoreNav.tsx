"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The Core suite's primary navigation — the four surfaces the truck runs on,
 * rendered into the shared CoreShell header. This is Core's own switcher; it
 * does NOT use the admin sidebar / nav.config (Core is a separate entity from
 * /admin). Active state is derived from the pathname so every surface lights
 * the same tab in the same place.
 *
 * Icons are the mockup's own line glyphs (POS terminal · KDS screen · guest ·
 * service cloche), inlined 1:1 from the Core mockup rather than lucide so the
 * nav reads exactly like the design.
 */

const ICON = {
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
} as const;

const SURFACES: { key: keyof typeof ICON; href: string; label: string }[] = [
  { key: "pos", href: "/core/pos", label: "POS" },
  { key: "kds", href: "/core/kds", label: "KDS" },
  { key: "guest", href: "/core/guest", label: "Guest" },
  { key: "service", href: "/core/service", label: "Service" },
];

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      {children}
    </svg>
  );
}

export function CoreNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="core-nav" aria-label="Core surfaces">
      {SURFACES.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.key}
            href={s.href}
            className={active ? "on" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon>{ICON[s.key]}</NavIcon>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
