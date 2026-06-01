"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Armchair, ChefHat, ChevronLeft, Receipt, UsersRound, UtensilsCrossed } from "lucide-react";

/**
 * The Core suite shell — the mockup's SI sidebar + topbar (system.css `.shell`).
 * It owns the full viewport (`.core-suite` is a fixed layer) and replaces the
 * admin chrome on /admin/pos, /admin/kds and /admin/guest (AdminShell steps
 * aside for those routes). Ported from public/mockups/core-suite/*.html.
 */

type CoreKey = "pos" | "kds" | "guest";

const CORE_NAV: { key: CoreKey; href: string; label: string; icon: typeof Receipt }[] = [
  { key: "pos", href: "/admin/pos", label: "POS", icon: Receipt },
  { key: "kds", href: "/admin/kds", label: "KDS", icon: ChefHat },
  { key: "guest", href: "/admin/guest", label: "Guest Engagement", icon: UsersRound },
];

const OPS_NAV: { href: string; label: string; icon: typeof Receipt }[] = [
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/floor", label: "Floor", icon: Armchair },
];

function initials(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "SI";
  const p = n.split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || n.slice(0, 2).toUpperCase();
}

export function CoreShell({
  active,
  crumbs,
  viewnav,
  topbarRight,
  children,
}: {
  active: CoreKey;
  /** Breadcrumb content, e.g. <>Core / <b>Guest Engagement</b></>. */
  crumbs: ReactNode;
  /** Optional sub-view switcher (rendered in the topbar `.viewnav` slot). */
  viewnav?: ReactNode;
  /** Optional right-aligned topbar actions. */
  topbarRight?: ReactNode;
  children: ReactNode;
}) {
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

          <div className="nav-group">
            <div className="eyebrow">Core</div>
            {CORE_NAV.map((n) => {
              const Icon = n.icon;
              return (
                <Link key={n.key} href={n.href} className={`nav-item${active === n.key ? " active" : ""}`}>
                  <Icon className="nav-ico" />
                  {n.label}
                </Link>
              );
            })}
          </div>

          <div className="nav-group">
            <div className="eyebrow">Operations</div>
            {OPS_NAV.map((n) => {
              const Icon = n.icon;
              return (
                <Link key={n.href} href={n.href} className="nav-item">
                  <Icon className="nav-ico" />
                  {n.label}
                </Link>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          <Link href="/admin" className="nav-item">
            <ChevronLeft className="nav-ico" />
            All admin
          </Link>

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
