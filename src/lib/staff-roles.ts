/**
 * Job-title taxonomy + surface routing (client-safe).
 *
 * A manager hires people by JOB TITLE — pizzaiolo, chef, KP, waiter — not by
 * the abstract access tier (`AdminRole`) the login system gates on. This module
 * is the single bridge between the two worlds:
 *
 *   StaffRole (job title)  ──staffRoleToAdminRole──▶  AdminRole (access tier)
 *   AdminRole              ──landingPathForRole────▶  the surface they land on
 *
 * Routing rule (the owner's brief): kitchen titles land on the KDS, floor
 * titles land on the POS, managers get the scoped admin shell. Importing only
 * the `AdminRole` *type* keeps this leaf client-safe — no server modules — so
 * the hire dialog, the login page redirect, and the server login route all
 * agree on one mapping.
 */

import type { AdminRole } from "@/lib/admin-roles";
import type { StaffRole } from "@/data/types";

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  manager: "Manager",
  pizzaiolo: "Pizzaiolo",
  chef: "Chef",
  kp: "Kitchen porter (KP)",
  kitchen: "Kitchen (general)",
  waiter: "Waiter",
  front: "Front of house",
  driver: "Driver",
  courier: "Courier",
};

export type StaffRoleGroup = "management" | "kitchen" | "floor" | "delivery";

export const STAFF_ROLE_GROUP: Record<StaffRole, StaffRoleGroup> = {
  manager: "management",
  pizzaiolo: "kitchen",
  chef: "kitchen",
  kp: "kitchen",
  kitchen: "kitchen",
  waiter: "floor",
  front: "floor",
  driver: "delivery",
  courier: "delivery",
};

/** Job titles grouped for a `<Select>`/optgroup in the hire dialog. */
export const STAFF_ROLE_OPTIONS: { group: string; roles: StaffRole[] }[] = [
  { group: "Management", roles: ["manager"] },
  { group: "Kitchen", roles: ["pizzaiolo", "chef", "kp", "kitchen"] },
  { group: "Floor", roles: ["waiter", "front"] },
  { group: "Delivery", roles: ["driver", "courier"] },
];

/**
 * Maps a job title to the access tier its login account gets. Kitchen titles
 * become `kitchen` (KDS-only); floor + delivery become `staff` (POS/orders);
 * a manager hire would become `manager` — but managers are provisioned by the
 * owner via /admin/users, never through the hire flow, which is capped at
 * staff/kitchen (see staff route guards).
 */
export function staffRoleToAdminRole(role: StaffRole): AdminRole {
  switch (STAFF_ROLE_GROUP[role]) {
    case "management":
      return "manager";
    case "kitchen":
      return "kitchen";
    case "floor":
    case "delivery":
    default:
      return "staff";
  }
}

/**
 * Where a freshly-authenticated user lands. The owner's routing brief:
 * kitchen → KDS, floor → POS, manager → their own scoped Manager portal,
 * franchisee → the Franchisee portal, and only the owner lands on the
 * company-wide `/admin` HQ dashboard (which is owner-gated server-side).
 *
 * Managers keep access to the operational admin pages their permissions
 * grant (Orders, Schedule, Inventory, KDS, POS…); `/manager` is just their
 * home, not a cage — the wall is only around the `/admin` HQ root.
 */
export function landingPathForRole(role: AdminRole): string {
  switch (role) {
    case "kitchen":
      return "/core/kds";
    case "staff":
      return "/core/pos";
    case "manager":
      return "/manager";
    case "franchisee":
      return "/franchisee";
    case "owner":
    default:
      // Admin v3 cutover: the owner HQ is now the v3 rebuild. /admin still
      // works (middleware 307s it to /admin-v3), but land owners directly to
      // skip the redirect hop. Revert to "/admin" to fall back to v2.
      return "/admin-v3";
  }
}

/** Convenience: landing surface straight from a job title. */
export function landingPathForStaffRole(role: StaffRole): string {
  return landingPathForRole(staffRoleToAdminRole(role));
}
