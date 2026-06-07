"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HandPlatter, MonitorPlay, Receipt, UsersRound } from "lucide-react";

/**
 * The Core suite's primary navigation — the four surfaces the truck runs on,
 * rendered into the shared CoreShell header. This is Core's own switcher; it
 * does NOT use the admin sidebar / nav.config (Core is a separate entity from
 * /admin). Active state is derived from the pathname so every surface lights
 * the same tab in the same place.
 */

const SURFACES: { key: string; href: string; label: string; icon: typeof Receipt }[] = [
  { key: "pos", href: "/core/pos", label: "POS", icon: Receipt },
  { key: "kds", href: "/core/kds", label: "KDS", icon: MonitorPlay },
  { key: "guest", href: "/core/guest", label: "Guest", icon: UsersRound },
  { key: "service", href: "/core/service", label: "Service", icon: HandPlatter },
];

export function CoreNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="core-nav" aria-label="Core surfaces">
      {SURFACES.map((s) => {
        const Icon = s.icon;
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.key}
            href={s.href}
            className={active ? "on" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon width={15} height={15} />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
