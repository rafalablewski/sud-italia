"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Menu, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { ALL_NAV_ITEMS_V3 } from "./nav.config";
import { ThemeToggleV3 } from "./ThemeToggleV3";
import { CommsBell } from "@/components/portal/CommsBell";
import { useAdminLocationV3 } from "./LocationContext";
import { adminV3BaseForPath, withAdminV3Base, canonicalAdminV3Path } from "@/lib/admin-base";

interface Props {
  onOpenMobileNav: () => void;
}

interface Crumb {
  label: string;
  href?: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  // Role-prefix aware: under /manager or /franchisee the path is canonicalised
  // to its /admin form for label lookup, while crumb hrefs are re-rooted back
  // onto the URL's base so a manager's breadcrumbs stay in /manager.
  const base = adminV3BaseForPath(pathname);
  const canon = canonicalAdminV3Path(pathname);
  if (canon === "/admin") return [{ label: "Dashboard" }];
  const segments = canon.split("/").filter(Boolean); // ["admin", ...]
  const crumbs: Crumb[] = [{ label: "Admin", href: withAdminV3Base(base, "/admin") }];
  let acc = "/admin";
  for (let i = 1; i < segments.length; i++) {
    acc += "/" + segments[i];
    const hit = ALL_NAV_ITEMS_V3.find((n) => n.href === acc);
    const isLast = i === segments.length - 1;
    crumbs.push({
      label: hit ? hit.label : segments[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      href: isLast ? undefined : withAdminV3Base(base, acc),
    });
  }
  return crumbs;
}

export function TopbarV3({ onOpenMobileNav }: Props) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  const { location, setLocation, activeLocations } = useAdminLocationV3();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const fetchCount = () =>
      fetch("/api/admin/notifications?count=true")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setUnread(d.unread || 0);
        })
        .catch(() => {});
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="av3-topbar">
      <button type="button" className="av3-icon-btn av3-side-toggle-mobile" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu className="av3-btn-ico" />
      </button>

      <nav aria-label="Breadcrumb" className="av3-crumbs">
        <ol>
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`}>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              {i < crumbs.length - 1 && <span className="av3-crumb-sep" aria-hidden>/</span>}
            </li>
          ))}
        </ol>
      </nav>

      <div className="av3-topbar-spacer" />

      <div className="av3-topbar-right">
        <span className="av3-scope">
          <MapPin className="av3-scope-ico" aria-hidden />
          <select aria-label="Location scope" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">All locations</option>
            {activeLocations.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.city}
              </option>
            ))}
          </select>
          <ChevronDown className="av3-scope-chev" aria-hidden />
        </span>

        <ThemeToggleV3 />

        {/* Personal comms (announcements + to-dos) — separate from the
            operational alerts bell beside it, per the comms separation rule. */}
        <CommsBell />

        {/* Operational alerts (new orders / low stock / disputes). */}
        <button type="button" className="av3-icon-btn" aria-label={unread > 0 ? `${unread} unread alerts` : "Alerts"}>
          <Bell className="av3-btn-ico" />
          {unread > 0 && <span className="av3-bell-badge" aria-hidden>{unread > 9 ? "9+" : unread}</span>}
        </button>
      </div>
    </header>
  );
}
