/**
 * "Jump to" quick-link registry for the role dashboards (the Manager portal,
 * the owner's preview of it, the Franchisee home).
 *
 * Client-safe leaf — imports only the permission catalog + the admin-base
 * helpers (both themselves client-safe), so a server component (the Manager
 * portal) and any `"use client"` surface can share one source of truth.
 *
 * Model: a card is **never** shown unconditionally. Each card declares the
 * single permission that unlocks its destination — the SAME key
 * `permissionForAdminPage()` gates that page with — and `getDashboardQuickLinks`
 * filters the registry to the viewer's *effective* permissions. So the admin
 * controls exactly what appears in "Jump to" through the Permission Matrix they
 * already own (role default via `ROLE_DEFAULT_PERMISSIONS`, or a per-user custom
 * grant): drop `pos.view` from a manager and the POS card disappears from their
 * dashboard. There is no separate "which cards" config to drift, and a card can
 * no longer be shown to someone who'd just get bounced on click.
 */

import {
  ClipboardList,
  Flame,
  CalendarDays,
  Boxes,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AdminRole } from "@/lib/admin-roles";
import {
  type PermissionKey,
  resolveEffectivePermissions,
  effectiveHas,
} from "@/lib/permissions";
import { adminBaseForRole, withAdminBase } from "@/lib/admin-base";

export interface DashboardQuickLink {
  /** Canonical href (`/admin/*` page namespace or the shared `/core/*` suite). */
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** The permission that unlocks the destination — gates the card's visibility. */
  permission: PermissionKey;
}

/**
 * The canonical registry. Hrefs are canonical (`/admin/*` or `/core/*`);
 * `getDashboardQuickLinks` re-roots the `/admin/*` ones onto the viewer's role
 * prefix. Each `permission` MUST match what `permissionForAdminPage()` requires
 * for that href, so "shown" and "reachable" can never disagree.
 */
export const DASHBOARD_QUICK_LINKS: readonly DashboardQuickLink[] = [
  { href: "/admin/orders", label: "Orders", desc: "Live tickets & history", icon: ClipboardList, permission: "orders.view" },
  { href: "/core/kds", label: "Kitchen Display", desc: "The line, by station", icon: Flame, permission: "kds.view" },
  { href: "/admin/schedule", label: "Schedule", desc: "Shifts & rota", icon: CalendarDays, permission: "schedule.view" },
  { href: "/admin/inventory", label: "Inventory", desc: "Stock & counts", icon: Boxes, permission: "inventory.view" },
  { href: "/core/pos", label: "Point of sale", desc: "Take an order", icon: Receipt, permission: "pos.view" },
  { href: "/admin/staff", label: "Team", desc: "Roster & hiring", icon: Users, permission: "staff.view" },
] as const;

/**
 * The quick links a given user may see: the registry filtered to the cards their
 * EFFECTIVE permissions unlock (owner = all; a custom-grant user = exactly their
 * grant; everyone else = their role default), each href re-rooted onto the
 * role's URL prefix (`/manager/*`, `/franchisee/*`, or the canonical `/admin/*`).
 * Pure — safe to call from a server component.
 */
export function getDashboardQuickLinks(user: {
  role: AdminRole;
  permissions?: readonly string[] | null;
  id?: string;
}): DashboardQuickLink[] {
  const eff = resolveEffectivePermissions(user);
  const base = adminBaseForRole(user.role);
  return DASHBOARD_QUICK_LINKS.filter((link) =>
    effectiveHas(eff, link.permission),
  ).map((link) => ({ ...link, href: withAdminBase(base, link.href) }));
}
