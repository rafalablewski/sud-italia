"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The Core suite's primary navigation — the four surfaces the truck runs on,
 * rendered into the shared CoreShell header. This is Core's own switcher; it
 * does NOT use the admin sidebar / nav.config (Core is a separate entity from
 * /admin). Active state is derived from the pathname so every surface lights
 * the same tab in the same place.
 *
 * Tabs use emoji glyphs (receipt · cooking · guest · dining) — the same
 * emoji language as the POS category rail.
 */

const SURFACES: { key: string; href: string; label: string; emoji: string }[] = [
  { key: "pos", href: "/core/pos", label: "POS", emoji: "🧾" },
  { key: "kds", href: "/core/kds", label: "KDS", emoji: "🍳" },
  { key: "guest", href: "/core/guest", label: "Guest", emoji: "🙋" },
  { key: "service", href: "/core/service", label: "Service", emoji: "🍽️" },
];

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
            <span className="core-nav-emoji" aria-hidden>
              {s.emoji}
            </span>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
