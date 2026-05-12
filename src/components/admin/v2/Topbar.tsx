"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, HelpCircle, Menu, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { ALL_NAV_ITEMS } from "./nav.config";
import { ThemeToggle } from "./ThemeToggle";
import { useAdminShell } from "./ShellContext";

interface Props {
  onOpenMobileNav: () => void;
}

interface Crumb {
  label: string;
  href?: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  if (!pathname.startsWith("/admin")) return [];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1) return [{ label: "Dashboard" }];

  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin" }];
  let acc = "/admin";
  for (let i = 1; i < segments.length; i++) {
    acc += "/" + segments[i];
    const navHit = ALL_NAV_ITEMS.find((n) => n.href === acc);
    const isLast = i === segments.length - 1;
    crumbs.push({
      label: navHit ? navHit.label : segments[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      href: isLast ? undefined : acc,
    });
  }
  return crumbs;
}

export function Topbar({ onOpenMobileNav }: Props) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  const { openPalette, openNotifications, openHelp, notificationsVersion } = useAdminShell();
  const [unread, setUnread] = useState(0);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);

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
    // Re-fetch when the panel reports a change so the badge updates immediately
  }, [notificationsVersion]);

  return (
    <header className="v2-topbar">
      <div className="v2-topbar-left">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
          className="v2-icon-btn v2-mobile-only"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
        <nav aria-label="Breadcrumb" className="v2-crumbs">
          <ol>
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`}>
                {c.href ? (
                  <Link href={c.href}>{c.label}</Link>
                ) : (
                  <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>
                )}
                {i < crumbs.length - 1 && <span className="v2-crumb-sep" aria-hidden>/</span>}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <div className="v2-topbar-right">
        <button
          type="button"
          onClick={openPalette}
          className="v2-search-trigger"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="v2-search-placeholder">Search anything…</span>
          <kbd className="v2-kbd">{isMac ? "⌘" : "Ctrl"}<span>K</span></kbd>
        </button>

        <button
          type="button"
          onClick={openHelp}
          className="v2-icon-btn"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        <ThemeToggle />

        <button
          type="button"
          onClick={openNotifications}
          aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
          className="v2-icon-btn v2-bell"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="v2-bell-badge" aria-hidden>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
