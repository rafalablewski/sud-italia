"use client";

import { useEffect, useMemo, useState } from "react";
import { filterNavForRole, NAV_SECTIONS, type NavSection } from "./nav.config";
import type { AdminRole } from "@/lib/admin-roles";

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
  const [role, setRole] = useState<AdminRole | null>(null);
  const [simulationEnabled, setSimulationEnabled] = useState<boolean | null>(
    null,
  );

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

  return useMemo(
    () =>
      role
        ? filterNavForRole(role, { simulation: simulationEnabled ?? true })
        : NAV_SECTIONS,
    [role, simulationEnabled],
  );
}
