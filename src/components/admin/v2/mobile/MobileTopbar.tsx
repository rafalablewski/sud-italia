"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, Search } from "lucide-react";
import { ALL_NAV_ITEMS } from "../nav.config";
import { useAdminShell } from "../ShellContext";

interface Props {
  /** Optional title override. Falls back to the matched nav label. */
  title?: string;
  /** When true, replaces the brand mark with a back button. */
  showBack?: boolean;
}

/**
 * 48px topbar for mobile. Shows page title, search, and bell. The location
 * switcher and theme toggle move to the More drawer's footer because two
 * right-aligned icons are the maximum thumbs can reach on a 6.7" device
 * without re-gripping.
 */
export function MobileTopbar({ title, showBack }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { openPalette, openNotifications, notificationsVersion } = useAdminShell();
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
    // Pause polling while the tab is hidden (battery on mobile).
    const onVis = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchCount();
    }, 30000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [notificationsVersion]);

  const navHit = ALL_NAV_ITEMS.find((n) => {
    if (n.href === "/admin") return pathname === "/admin";
    return pathname === n.href || pathname.startsWith(n.href + "/");
  });
  const displayTitle =
    title ?? (navHit?.label ?? (pathname === "/admin" ? "Home" : "Admin"));

  return (
    <header className="v2-m-topbar" role="banner">
      <div className="v2-m-topbar-left">
        {showBack ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="v2-m-icon-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link href="/admin" className="v2-m-brand" aria-label="Home">
            <span className="v2-m-brand-mark" aria-hidden>SI</span>
          </Link>
        )}
        <h1 className="v2-m-topbar-title" aria-live="polite">
          {displayTitle}
        </h1>
      </div>
      <div className="v2-m-topbar-right">
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search"
          className="v2-m-icon-btn"
        >
          <Search className="h-5 w-5" />
        </button>
        <BellButton openNotifications={openNotifications} unread={unread} />
      </div>
    </header>
  );
}

/** Bell with long-press shortcut to the full-screen `/admin/alerts` view. */
function BellButton({
  openNotifications,
  unread,
}: {
  openNotifications: () => void;
  unread: number;
}) {
  const router = useRouter();
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const start = () => {
    longPressed.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      router.push("/admin/alerts");
    }, 450);
  };
  const cancel = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={() => {
        // Long-press already navigated — skip the bottom-sheet open.
        if (longPressed.current) return;
        openNotifications();
      }}
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
      className="v2-m-icon-btn v2-m-bell"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="v2-m-bell-badge" aria-hidden>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
