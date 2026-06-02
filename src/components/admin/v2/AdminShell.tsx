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
import { permissionForAdminPage } from "@/lib/permissions";

interface Props {
  children: ReactNode;
}

const BARE_ROUTES = ["/admin/login"];

// Core suite surfaces render their own full-viewport shell (the mockup's SI
// sidebar + topbar), so the admin chrome steps aside — but the data providers
// (location, toast, shell context) stay so the Core components keep working.
// Routes are added here as each surface is rebuilt onto the Core suite shell.
const CORE_ROUTES = ["/admin/guest", "/admin/pos", "/admin/kds", "/admin/service"];

export function AdminShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isBare = BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifVersion, setNotifVersion] = useState(0);

  // Granular-permission page guard. The sidebar already hides forbidden items,
  // but a user can still type a URL (or follow a stale bookmark) into a page
  // they no longer have. We resolve their effective permissions once, then
  // bounce any navigation to a page whose `.view` permission they lack back to
  // the Dashboard (which is intentionally ungated). The server still enforces
  // the real boundary on every /api/admin/* call — this is the UX layer.
  const [permGate, setPermGate] = useState<{
    keys: Set<string>;
    custom: boolean;
    // Where to bounce a forbidden navigation. The owner's `/admin` HQ is now
    // owner-gated, so a non-owner can't be dumped there — fall back to their
    // own home (manager → /manager, etc.) which /api/admin/me resolves.
    home: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.role) return;
        setPermGate({
          keys: new Set<string>(Array.isArray(j.permissions) ? j.permissions : []),
          custom: !!j.custom,
          home: typeof j.signIn?.landing === "string" ? j.signIn.landing : "/admin",
        });
      })
      .catch(() => {
        /* non-fatal — server still enforces */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Only custom-grant users are guarded client-side; role-default and
    // all-access (owner) users keep their existing behaviour untouched.
    if (!permGate || !permGate.custom) return;
    const need = permissionForAdminPage(pathname);
    if (need && !permGate.keys.has(need)) {
      router.replace(permGate.home);
    }
  }, [pathname, permGate, router]);

  // Close drawers on route change
  useEffect(() => {
    setMobileOpen(false);
    setPaletteOpen(false);
    setNotifOpen(false);
    setHelpOpen(false);
  }, [pathname]);

  // Lock scroll while any overlay is open (only relevant for the desktop
  // chrome — mobile sheets lock body scroll independently).
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
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openNotifications = useCallback(() => setNotifOpen(true), []);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const bumpNotifications = useCallback(
    () => setNotifVersion((v) => v + 1),
    [],
  );

  const onGoto = useCallback(
    (key: string) => {
      const hit = ALL_NAV_ITEMS.find((n) => n.shortcut === key);
      if (hit) router.push(hit.href);
    },
    [router],
  );

  useShortcuts({ onOpenPalette: openPalette, onOpenHelp: openHelp, onOpenNotifications: openNotifications, onGoto });

  const ctxValue = useMemo<ShellOverlays>(
    () => ({
      openPalette,
      closePalette,
      openNotifications,
      closeNotif,
      openHelp,
      paletteOpen,
      notifOpen,
      notificationsVersion: notifVersion,
      bumpNotifications,
    }),
    [
      openPalette,
      closePalette,
      openNotifications,
      closeNotif,
      openHelp,
      paletteOpen,
      notifOpen,
      notifVersion,
      bumpNotifications,
    ],
  );

  if (isBare) {
    return <>{children}</>;
  }

  const isCore = CORE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  // Core surfaces render their own full-viewport shell (.core-suite / .kds-core
  // fixed layers), so the admin chrome steps aside — providers only. The Core
  // pages reflow their desktop layout responsively (the mobile shell is
  // retired; see docs/design-system/admin/mobile).
  if (isCore) {
    return (
      <AdminLocationProvider>
        <ShellContext.Provider value={ctxValue}>
          <ToastProvider>{children}</ToastProvider>
        </ShellContext.Provider>
      </AdminLocationProvider>
    );
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

            <CommandPalette open={paletteOpen} onClose={closePalette} />
            <NotificationPanel
              open={notifOpen}
              onClose={closeNotif}
              onChanged={bumpNotifications}
            />
            <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
          </div>
        </ToastProvider>
      </ShellContext.Provider>
    </AdminLocationProvider>
  );
}
