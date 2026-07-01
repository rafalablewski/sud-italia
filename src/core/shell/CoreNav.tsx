"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CORE_SURFACES } from "@/core/routes";

/**
 * The Lens Rail — the left, icon-only rail (60px, expands on hover) that switches
 * how you view the room, not which app you're in. Exactly the four Service OS
 * lenses, in spec order: Floor (the map) · Line (POS/ordering) · Pass (KDS) ·
 * Book (slots/reservations). The selected entity persists across every lens (see
 * SelectionContext + CoreDock), so switching lens re-renders the SAME selection.
 *
 * Orders and Guest are cross-cutting surfaces, not room lenses — they are reached
 * from the Command Bar's ⌘K ("the tiramisu order", "Kowalski"), per the IA spec.
 * Active state is derived from the pathname; hrefs come from @/core/routes.
 */

const ICON: Record<string, ReactNode> = {
  service: (
    <>
      <path d="M3 11a9 9 0 0 1 18 0Z" />
      <path d="M12 2v3M2 16h20M5 20h14" />
    </>
  ),
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
  book: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </>
  ),
};

// The four room lenses, in the spec's rail order.
const LENSES: { key: keyof typeof ICON; href: string; label: string }[] = [
  { key: "service", href: CORE_SURFACES.service, label: "Floor" },
  { key: "pos", href: CORE_SURFACES.pos, label: "Line" },
  { key: "kds", href: CORE_SURFACES.kds, label: "Pass" },
  { key: "book", href: CORE_SURFACES.book, label: "Book" },
];

export function CoreNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="core-rail" aria-label="Lenses">
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
