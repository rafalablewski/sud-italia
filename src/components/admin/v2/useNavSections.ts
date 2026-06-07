"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterNavForPermissions,
  filterNavForRole,
  NAV_SECTIONS,
  type NavSection,
} from "./nav.config";
import type { AdminRole } from "@/lib/admin-roles";
import { withAdminBase } from "@/lib/admin-base";
import { useAdminBase } from "@/shared/useAdminBase";

/**
 * Shared nav source for both sidebars (v2 AdminShell + Core suite shell) so the
 * full admin navigation renders identically everywhere — same sections, same
 * role gating, same feature-flag gating. Before this, CoreShell hard-coded a
 * stripped 5-item core list while AdminShell rendered the full tree; the two
 * now agree by construction.
 *
 * While the role request is in flight we return the unfiltered tree — a brief
 * over-render is better UX than an empty sidebar, and the server still enforces
 * the real permissions, so showing an extra link is cosmetic only. `simulation`
 * defaults to on until settings load so a slow fetch can't flash the Calculator
 * out of the nav.
 */
export function useNavSections(): NavSection[] {
  const [perms, setPerms] = useState<{
    role: AdminRole;
    keys: string[];
    allAccess: boolean;
    custom: boolean;
  } | null>(null);
  const [simulationEnabled, setSimulationEnabled] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.role) {
          setPerms({
            role: j.role as AdminRole,
            keys: Array.isArray(j.permissions) ? j.permissions : [],
            allAccess: !!j.allAccess,
            custom: !!j.custom,
          });
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    const loadSettings = () => {
      fetch("/api/admin/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancelled && j) setSimulationEnabled(!!j.simulationEnabled);
        })
        .catch(() => {
          /* non-fatal */
        });
    };
    loadSettings();
    // AdminSettings dispatches this when a toggle persists so the nav updates
    // without a full page reload.
    window.addEventListener("sud-admin-settings-updated", loadSettings);
    return () => {
      cancelled = true;
      window.removeEventListener("sud-admin-settings-updated", loadSettings);
    };
  }, []);

  // Re-root every nav href onto the prefix the page is served under so a
  // manager's sidebar links read /manager/* (and a franchisee's /franchisee/*)
  // instead of /admin/*. Permission gating still keys on the canonical href
  // (filtering runs first, below), so the prefix is purely cosmetic.
  const base = useAdminBase();

  return useMemo(() => {
    const flags = { simulation: simulationEnabled ?? true };
    // Owner / all-access and custom-grant users gate on permissions; everyone
    // else keeps the legacy role-rank nav so the upgrade is invisible to them.
    const sections = !perms
      ? NAV_SECTIONS // still loading — over-render briefly
      : perms.allAccess || perms.custom
        ? filterNavForPermissions(perms.keys, perms.allAccess, flags)
        : filterNavForRole(perms.role, flags);
    if (base === "/admin") return sections;
    return sections.map((s) => ({
      ...s,
      items: s.items.map((it) => ({ ...it, href: withAdminBase(base, it.href) })),
    }));
  }, [perms, simulationEnabled, base]);
}
