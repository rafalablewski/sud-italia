"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CORE_SURFACES } from "@/core/routes";

/**
 * The Lens Rail — the left, icon-only rail (60px) that switches how you view the
 * room, not which app you're in. Exactly the four Service OS lenses, in spec
 * order: Floor (the map) · POS (the till / ordering) · KDS (the pass) · Book
 * (slots / reservations). We keep the **old, plain names** (POS / KDS) rather
 * than "Line"/"Pass" — operators know them.
 *
 * The rail is collapsed to icons by default and expands to reveal labels only
 * when the operator **pins** it (a click on the pin toggle) — never on hover, so
 * a stray brush of the cursor never shoves the Canvas. The pinned choice
 * persists across surfaces (localStorage). The selected entity persists across
 * every lens (SelectionContext + CoreDock), so switching lens re-renders the
 * SAME selection.
 *
 * Orders and Guest are cross-cutting surfaces, not room lenses — they are
 * reached from the Command Bar's ⌘K ("the tiramisu order", "Kowalski"). Active
 * state is derived from the pathname; hrefs come from @/core/routes.
 *
 * The rail owns the `.core-lens` class (distinct from the POS category
 * `.core-rail`) — see docs/design-system/core/theme/README.md → "Chrome".
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

// The four room lenses, in the spec's rail order. Labels are the plain names.
const LENSES: { key: keyof typeof ICON; href: string; label: string }[] = [
  { key: "service", href: CORE_SURFACES.service, label: "Floor" },
  { key: "pos", href: CORE_SURFACES.pos, label: "POS" },
  { key: "kds", href: CORE_SURFACES.kds, label: "KDS" },
  { key: "book", href: CORE_SURFACES.book, label: "Book" },
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
          <path d="M9 4v16M4 8h4M14 4l5 8-5 8" />
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
