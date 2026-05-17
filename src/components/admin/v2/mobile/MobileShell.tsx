"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminRole } from "@/lib/admin-roles";
import { useAdminShell } from "../ShellContext";
import { BottomNav } from "./BottomNav";
import { MoreDrawer } from "./MoreDrawer";
import { QuickActionSheet } from "./QuickActionSheet";
import { MobileCommandPalette } from "./MobileCommandPalette";
import { MobileNotifications } from "./MobileNotifications";
import { MobileTopbar } from "./MobileTopbar";

interface Props {
  children: ReactNode;
}

const DETAIL_ROUTE_PATTERNS: RegExp[] = [
  /^\/admin\/customers\/[^/]+$/,
  /^\/admin\/menu\/[^/]+$/,
  /^\/admin\/locations\/manage(\/.*)?$/,
];

function isDetailRoute(pathname: string): boolean {
  return DETAIL_ROUTE_PATTERNS.some((r) => r.test(pathname));
}

/**
 * Mobile counterpart to AdminShell. Lives inside the same shell context
 * (palette, notifications, location) but draws a fundamentally different
 * chrome: bottom nav + topbar + floating action button. The desktop
 * AdminShell renders this instead of its own chrome when `useIsMobile()`
 * is true.
 */
export function MobileShell({ children }: Props) {
  const pathname = usePathname();
  const { paletteOpen, closePalette, notifOpen, closeNotif, notificationsVersion, bumpNotifications } =
    useAdminShell();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.role) setRole(j.role as AdminRole);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Close transient overlays on route change. Palette/notif are closed
  // by the parent shell via the same pathname effect; we own More/Quick.
  useEffect(() => {
    setMoreOpen(false);
    setQuickOpen(false);
  }, [pathname]);

  const isDetail = isDetailRoute(pathname);

  return (
    <div className="v2-m-shell" data-detail={isDetail ? "true" : "false"}>
      <MobileTopbar showBack={isDetail} />
      <main className="v2-m-content" id="main">
        {children}
      </main>
      <BottomNav
        role={role}
        onOpenMore={() => setMoreOpen(true)}
        onTriggerQuick={() => setQuickOpen(true)}
      />

      <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} role={role} />
      <QuickActionSheet open={quickOpen} onClose={() => setQuickOpen(false)} role={role} />
      <MobileCommandPalette open={paletteOpen} onClose={closePalette} />
      <MobileNotifications
        open={notifOpen}
        onClose={closeNotif}
        onChanged={bumpNotifications}
      />
      {/* notificationsVersion is consumed by topbar bell — referencing it here
          keeps the value in scope and lint-clean while reminding maintainers
          that this shell sits inside the shared ShellContext. */}
      <span hidden aria-hidden data-notif-v={notificationsVersion} />
    </div>
  );
}
