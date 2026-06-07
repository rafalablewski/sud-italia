"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminLocationProvider } from "@/components/admin/v2/LocationContext";
import { ShellContext, type ShellOverlays } from "@/components/admin/v2/ShellContext";
import { ToastProvider } from "@/ui/Toast";
import { permissionForAdminPage } from "@/lib/permissions";

/**
 * Provider envelope for the Core suite (`/core/*` — POS, KDS, Guest, Service).
 *
 * These surfaces used to live under `/admin/*` and borrow the providers from
 * AdminShell's "core" branch (chrome stepped aside, providers stayed). Now that
 * they have their own top-level `/core` segment, this client wrapper owns the
 * exact same trio — location context, the shell-overlay context (Topbar is the
 * only consumer and Core renders its own, so a minimal working value suffices)
 * and the toast portal — so CoreShell / AdminPos / AdminKDS keep working
 * unchanged.
 *
 * It also re-creates AdminShell's client page-guard: a custom-grant user who
 * lacks a surface's `.view` permission is bounced to their own home (the server
 * still enforces the real boundary on every /api/admin/* call — this is the UX
 * layer). Role-default + owner users are untouched, exactly as before.
 */
export function CoreProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifVersion, setNotifVersion] = useState(0);

  const value = useMemo<ShellOverlays>(
    () => ({
      openPalette: () => setPaletteOpen(true),
      closePalette: () => setPaletteOpen(false),
      openNotifications: () => setNotifOpen(true),
      closeNotif: () => setNotifOpen(false),
      openHelp: () => {},
      paletteOpen,
      notifOpen,
      notificationsVersion: notifVersion,
      bumpNotifications: () => setNotifVersion((v) => v + 1),
    }),
    [paletteOpen, notifOpen, notifVersion],
  );

  const [gate, setGate] = useState<{ keys: Set<string>; custom: boolean; home: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.role) return;
        setGate({
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
    if (!gate || !gate.custom) return;
    const need = permissionForAdminPage(pathname);
    if (need && !gate.keys.has(need)) {
      router.replace(gate.home);
    }
  }, [pathname, gate, router]);

  return (
    <AdminLocationProvider>
      <ShellContext.Provider value={value}>
        <ToastProvider>{children}</ToastProvider>
      </ShellContext.Provider>
    </AdminLocationProvider>
  );
}
