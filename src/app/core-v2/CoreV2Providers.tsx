"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminLocationProvider } from "@/shared/LocationContext";
import { ToastProvider } from "@/ui/Toast";
import { permissionForAdminPage } from "@/lib/permissions";

/**
 * Provider envelope for Core v2 (`/core-v2/*`). Core v2 is a separate entity
 * from /admin and from the current /core — but it keeps the same *technicals*
 * (location context, toasts, and the client page-guard) so every functionality
 * carries over. Styling is 100% the core-v2 theme; these are data/infra only.
 *
 * The page-guard mirrors the current Core: a custom-grant user who lacks a
 * surface's `.view` permission is bounced to their own home. The server still
 * enforces the real boundary on every /api/admin/* call — this is the UX layer.
 */
export function CoreV2Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

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
    // Map /core-v2/* onto the same permission keys the current Core uses.
    const need = permissionForAdminPage(pathname.replace("/core-v2", "/core"));
    if (need && !gate.keys.has(need)) {
      router.replace(gate.home);
    }
  }, [pathname, gate, router]);

  return (
    <AdminLocationProvider>
      <ToastProvider>{children}</ToastProvider>
    </AdminLocationProvider>
  );
}
