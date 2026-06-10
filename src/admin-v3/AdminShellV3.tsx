"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { permissionForAdminPage } from "@/lib/permissions";
import { AdminLocationProviderV3 } from "./LocationContext";
import { SidebarV3 } from "./SidebarV3";
import { TopbarV3 } from "./TopbarV3";

const COLLAPSE_KEY = "sud-admin-v3-collapsed";

export function AdminShellV3({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Page guard — parity with CoreProviders for the /core suite. A user carrying
  // an explicit custom grant only sees the pages the admin permitted in the
  // Permission Matrix, so a deep-link / typed URL to a page their grant excludes
  // bounces home instead of loading a shell whose data the API would 403. Owner
  // and role-default users keep the server-side rank redirects; the server still
  // enforces every /api/admin/* call regardless — this is the UX layer.
  // `permissionForAdminPage` normalises the /manager + /franchisee prefixes.
  const [gate, setGate] = useState<{
    keys: Set<string>;
    custom: boolean;
    home: string;
  } | null>(null);
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

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage may be blocked */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <AdminLocationProviderV3>
      <div className="av3-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
        {mobileOpen && <div className="av3-scrim" onClick={() => setMobileOpen(false)} aria-hidden />}
        <SidebarV3 collapsed={collapsed} onToggleCollapse={toggleCollapse} onNavigate={() => setMobileOpen(false)} />
        <div className="av3-main">
          <TopbarV3 onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="av3-content">{children}</main>
        </div>
      </div>
    </AdminLocationProviderV3>
  );
}
