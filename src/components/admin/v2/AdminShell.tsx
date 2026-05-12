"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminLocationProvider } from "./LocationContext";
import { CommandPalette } from "./CommandPalette";
import { NotificationPanel } from "./NotificationPanel";
import { ShellContext, type ShellOverlays } from "./ShellContext";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ToastProvider } from "./ui/Toast";
import { useShortcuts } from "./hooks/useShortcuts";
import { ALL_NAV_ITEMS } from "./nav.config";

interface Props {
  children: ReactNode;
}

const BARE_ROUTES = ["/admin/login"];

export function AdminShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isBare = BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifVersion, setNotifVersion] = useState(0);

  // Close drawers on route change
  useEffect(() => {
    setMobileOpen(false);
    setPaletteOpen(false);
    setNotifOpen(false);
    setHelpOpen(false);
  }, [pathname]);

  // Lock scroll while any overlay is open
  const anyOverlay = mobileOpen || paletteOpen || notifOpen || helpOpen;
  useEffect(() => {
    if (!anyOverlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [anyOverlay]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openNotifications = useCallback(() => setNotifOpen(true), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);

  const onGoto = useCallback(
    (key: string) => {
      const hit = ALL_NAV_ITEMS.find((n) => n.shortcut === key);
      if (hit) router.push(hit.href);
    },
    [router],
  );

  useShortcuts({ onOpenPalette: openPalette, onOpenHelp: openHelp, onOpenNotifications: openNotifications, onGoto });

  const ctxValue = useMemo<ShellOverlays>(
    () => ({ openPalette, openNotifications, openHelp, notificationsVersion: notifVersion }),
    [openPalette, openNotifications, openHelp, notifVersion],
  );

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <AdminLocationProvider>
      <ShellContext.Provider value={ctxValue}>
        <ToastProvider>
        <div className="v2-shell">
          <Sidebar />

          {mobileOpen && (
            <div className="v2-mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
              <div className="v2-mobile-scrim" onClick={() => setMobileOpen(false)} aria-hidden />
              <div className="v2-mobile-panel">
                <Sidebar isMobile onCloseMobile={() => setMobileOpen(false)} />
              </div>
            </div>
          )}

          <div className="v2-main">
            <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
            <main className="v2-content">{children}</main>
          </div>

          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
          <NotificationPanel
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            onChanged={() => setNotifVersion((v) => v + 1)}
          />
          <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
        </ToastProvider>
      </ShellContext.Provider>
    </AdminLocationProvider>
  );
}
