"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, LogOut, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NAV_SECTIONS } from "./nav.config";
import { LocationSwitcher } from "./LocationSwitcher";

const COLLAPSE_KEY = "sud-admin-sidebar-collapsed";

interface Props {
  onCloseMobile?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ onCloseMobile, isMobile = false }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* non-fatal */
    }
  }, []);

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
        {NAV_SECTIONS.map((section) => (
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
