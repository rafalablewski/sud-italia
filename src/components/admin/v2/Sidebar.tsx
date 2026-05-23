"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, LogOut, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { filterNavForRole, NAV_SECTIONS } from "./nav.config";
import type { AdminRole } from "@/lib/admin-roles";
import { LocationSwitcher } from "./LocationSwitcher";

const COLLAPSE_KEY = "sud-admin-sidebar-collapsed";

interface Props {
  onCloseMobile?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ onCloseMobile, isMobile = false }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [kdsSimulatorEnabled, setKdsSimulatorEnabled] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* non-fatal */
    }
  }, []);

  // m2_31: fetch the current role once per mount so we can filter the nav.
  // While the request is in flight we show the unfiltered nav — flicker is
  // visible briefly but the alternative (empty sidebar) is worse UX. The
  // server still enforces the actual permissions, so showing extra links
  // is cosmetic only.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.role) setRole(j.role as AdminRole);
      })
      .catch(() => {
        /* non-fatal */
      });
    const loadSettings = () => {
      fetch("/api/admin/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancelled && j) {
            setSimulationEnabled(!!j.simulationEnabled);
            setKdsSimulatorEnabled(!!j.kdsSimulatorEnabled);
          }
        })
        .catch(() => {
          /* non-fatal */
        });
    };
    loadSettings();
    // AdminSettings dispatches this when a toggle persists so the nav
    // updates without a full page reload.
    window.addEventListener("sud-admin-settings-updated", loadSettings);
    return () => {
      cancelled = true;
      window.removeEventListener("sud-admin-settings-updated", loadSettings);
    };
  }, []);

  // If we have a role, filter; otherwise show everything (pre-fetch state).
  const sections = useMemo(
    () =>
      role
        ? filterNavForRole(role, { simulation: simulationEnabled, kdsSimulator: kdsSimulatorEnabled })
        : NAV_SECTIONS,
    [role, simulationEnabled, kdsSimulatorEnabled],
  );

  const toggleCollapsed = useCallback(() => {
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

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  const isItemActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside
      data-collapsed={collapsed && !isMobile ? "true" : "false"}
      className="v2-sidebar"
      aria-label="Admin navigation"
    >
      <div className="v2-sidebar-header">
        <Link href="/admin" className="v2-brand" onClick={onCloseMobile}>
          <span className="v2-brand-mark" aria-hidden>SI</span>
          <span className="v2-brand-name">
            <span className="v2-brand-name-line">Sud Italia</span>
            <span className="v2-brand-name-sub">Operations</span>
          </span>
        </Link>
        {!isMobile && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className="v2-sidebar-collapse"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="v2-sidebar-nav" aria-label="Sections">
        {sections.map((section) => (
          <div key={section.id} className="v2-sidebar-section">
            <div className="v2-sidebar-section-label">{section.label}</div>
            <ul>
              {section.items.map((item) => {
                const active = isItemActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onCloseMobile}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`v2-nav-link ${active ? "is-active" : ""}`}
                    >
                      <Icon className="v2-nav-icon" aria-hidden />
                      <span className="v2-nav-label">{item.label}</span>
                      {item.shortcut && (
                        <span className="v2-nav-kbd" aria-hidden>g {item.shortcut}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="v2-sidebar-footer">
        <LocationSwitcher />
        <button type="button" onClick={handleLogout} className="v2-sidebar-logout">
          <LogOut className="h-3.5 w-3.5" />
          <span className="v2-nav-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
