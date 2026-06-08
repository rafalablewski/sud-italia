"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Core v2 shell — the left-sidebar chrome from the core-suite mockup
 * (public/mockups/core-suite/pos.html · guest.html). Shared by every v2
 * surface so each one's controls land in the same place.
 *
 * Core v2 is a SEPARATE ENTITY: this shell renders none of the /admin shell
 * (no app-sidebar, no nav.config, no admin theme). Its only chrome is the
 * mockup's `.sidebar` (brand + Core / Operations nav groups + user foot) and
 * the `.topbar` (breadcrumbs + the surface's own controls).
 *
 *   <CoreShellV2 active="pos" crumb="POS" topbar={<controls/>}>{body}</CoreShellV2>
 *
 * `active` lights the matching nav item; `crumb` is the bold breadcrumb word;
 * `topbar` is the surface's controls (rendered after the crumbs); `children`
 * is the surface body. `bleed` lets a full-bleed surface (KDS wall) own the
 * whole `.main` area without the standard topbar.
 */

export type CoreV2Surface = "pos" | "kds" | "guest" | "menu" | "floor";

const ICONS: Record<CoreV2Surface, ReactNode> = {
  pos: (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18" />
    </svg>
  ),
  kds: (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" />
    </svg>
  ),
  guest: (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  ),
  menu: (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  floor: (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16v13H4zM4 7l3-3h10l3 3" />
    </svg>
  ),
};

const CORE_NAV: { key: CoreV2Surface; href: string; label: string; dot?: boolean }[] = [
  { key: "pos", href: "/core-v2/pos", label: "POS" },
  { key: "kds", href: "/core-v2/kds", label: "KDS" },
  { key: "guest", href: "/core-v2/guest", label: "Guest Engagement" },
];
const OPS_NAV: { key: CoreV2Surface; href: string; label: string }[] = [
  { key: "menu", href: "/admin/menu", label: "Menu" },
  { key: "floor", href: "/core-v2/service", label: "Floor" },
];

type Me = { name?: string; role?: string; locationScope?: string | null };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role?: string): string {
  if (!role) return "Operator";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function CoreShellV2({
  active,
  crumb,
  topbar,
  bleed = false,
  children,
}: {
  active: CoreV2Surface;
  crumb: string;
  topbar?: ReactNode;
  bleed?: boolean;
  children: ReactNode;
}) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setMe({ name: j.name, role: j.role, locationScope: j.locationScope });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const name = me?.name || "Sud Italia";
  const scope = me?.locationScope && me.locationScope !== "all" ? me.locationScope : "All trucks";
  const sub = `${roleLabel(me?.role)} · ${scope.charAt(0).toUpperCase()}${scope.slice(1)}`;

  return (
    <div className="corev2">
      <div className="shell">
        <aside className="sidebar">
          <Link href="/core-v2/pos" className="brand" aria-label="Sud Italia Core">
            <div className="brand-mark">SI</div>
            <div>
              <div className="brand-name">Sud Italia</div>
              <div className="brand-sub">Operations</div>
            </div>
          </Link>

          <div className="nav-group">
            <div className="eyebrow">Core</div>
            {CORE_NAV.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className={`nav-item${active === n.key ? " active" : ""}`}
                aria-current={active === n.key ? "page" : undefined}
              >
                {ICONS[n.key]}
                {n.label}
                {n.dot && <span className="dot" />}
              </Link>
            ))}
          </div>

          <div className="nav-group">
            <div className="eyebrow">Operations</div>
            {OPS_NAV.map((n) => (
              <Link key={n.key} href={n.href} className={`nav-item${active === n.key ? " active" : ""}`}>
                {ICONS[n.key]}
                {n.label}
              </Link>
            ))}
          </div>

          <div className="sidebar-foot">
            <div className="avatar">{initials(name)}</div>
            <div style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 500 }}>{name}</div>
              <div className="subtle" style={{ fontSize: 10.5 }}>{sub}</div>
            </div>
          </div>
        </aside>

        <div className="main">
          {!bleed && (
            <div className="topbar">
              <div className="crumbs">
                Core / <b>{crumb}</b>
              </div>
              {topbar}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
