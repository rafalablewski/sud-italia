"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useNavSections } from "../v2/useNavSections";

/**
 * The Core suite shell — the mockup's SI sidebar + topbar (system.css `.shell`).
 * It owns the full viewport (`.core-suite` is a fixed layer) and replaces the
 * admin chrome on /admin/pos and /admin/guest (AdminShell steps aside for those
 * routes; KDS runs its own `.kds-core` wall with no sidebar). Ported from
 * public/mockups/core-suite/*.html.
 *
 * The sidebar renders the **full** admin navigation (`useNavSections`, the same
 * source AdminShell uses) so every page + subpage is reachable from POS / Guest,
 * not just a stripped core list — matching the one-sidebar look the rest of
 * admin uses.
 */

type CoreKey = "pos" | "kds" | "guest";

function initials(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "SI";
  const p = n.split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || n.slice(0, 2).toUpperCase();
}

export function CoreShell({
  crumbs,
  viewnav,
  topbarRight,
  children,
}: {
  /**
   * Legacy: which core surface is active. The sidebar now highlights by
   * pathname (it lists every route), so this no longer drives the active
   * state — kept optional so existing call sites don't need to change.
   */
  active?: CoreKey;
  /** Breadcrumb content, e.g. <>Core / <b>Guest Engagement</b></>. */
  crumbs: ReactNode;
  /** Optional sub-view switcher (rendered in the topbar `.viewnav` slot). */
  viewnav?: ReactNode;
  /** Optional right-aligned topbar actions. */
  topbarRight?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const sections = useNavSections();
  const [me, setMe] = useState<{ name?: string; role?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setMe(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isItemActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="core-suite">
      <div className="shell">
        <aside className="sidebar">
          <Link className="brand" href="/admin">
            <div className="brand-mark">SI</div>
            <div>
              <div className="brand-name">Sud Italia</div>
              <div className="brand-sub">Operations</div>
            </div>
          </Link>

          <div className="sidebar-scroll">
            {sections.map((section) => (
              <div key={section.id} className="nav-group">
                <div className="eyebrow">{section.label}</div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isItemActive(item.href) ? "page" : undefined}
                      className={`nav-item${isItemActive(item.href) ? " active" : ""}`}
                    >
                      <Icon className="nav-ico" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="sidebar-foot">
            <div className="avatar">{initials(me?.name)}</div>
            <div style={{ fontSize: 12, minWidth: 0 }}>
              <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {me?.name ?? "Operator"}
              </div>
              <div className="subtle" style={{ fontSize: "10.5px", textTransform: "capitalize" }}>
                {me?.role ?? "—"}
              </div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="crumbs">{crumbs}</div>
            {viewnav && (
              <div className="viewnav" style={{ marginLeft: 10 }}>
                {viewnav}
              </div>
            )}
            {topbarRight && <div className="topbar-right">{topbarRight}</div>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
