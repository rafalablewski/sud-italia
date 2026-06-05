"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { filterNavForRoleV3, type NavSectionV3 } from "./nav.config";
import type { AdminRole } from "@/lib/admin-roles";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}

export function SidebarV3({ collapsed, onToggleCollapse, onNavigate }: Props) {
  const pathname = usePathname();
  const [sections, setSections] = useState<NavSectionV3[]>([]);

  // Resolve the operator's role once, then gate the nav the same way v2 does
  // (server still enforces every /api/admin/* call — this is the UX layer).
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const role: AdminRole | null = j?.role ?? null;
        setSections(filterNavForRoleV3(role));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Longest-matching href wins so only one item lights up.
  const activeHref = sections
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((href) => (href === "/admin-v3" ? pathname === "/admin-v3" : pathname === href || pathname.startsWith(href + "/")))
    .sort((a, b) => b.length - a.length)[0];

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch (err) {
      // Network failure shouldn't trap the operator — still send them out.
      console.error("Logout request failed:", err);
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <aside className="av3-side" aria-label="Admin navigation">
      <Link href="/admin-v3" className="av3-brand" onClick={onNavigate}>
        <span className="av3-brand-mark" aria-hidden>SI</span>
        <span className="av3-brand-text">
          <span className="av3-brand-name">Sud Italia</span>
          <span className="av3-brand-sub">Operations · v3</span>
        </span>
      </Link>

      <nav className="av3-side-scroll" aria-label="Sections">
        {sections.map((section) => (
          <div key={section.id} className="av3-group">
            <div className="av3-eyebrow">{collapsed ? "·" : section.label}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`av3-nav-item ${active ? "is-active" : ""}`}
                  title={collapsed ? item.label : undefined}
                  style={item.pending ? { opacity: 0.55 } : undefined}
                >
                  <Icon className="av3-nav-ico" />
                  <span className="av3-nav-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="av3-side-foot">
        <button type="button" className="av3-collapse-btn" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronsRight className="av3-btn-ico" /> : <ChevronsLeft className="av3-btn-ico" />}
          <span className="av3-foot-label">Collapse</span>
        </button>
        <button type="button" className="av3-logout" onClick={handleLogout}>
          <LogOut className="av3-btn-ico" />
          <span className="av3-foot-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
