/**
 * Operator role primitives — mirrors `src/lib/admin-roles.ts`. The rank table is
 * the nav floor: an item with `requiredRole` shows only when the viewer's rank is
 * at least that role's rank (web `filterNavForRoleV3`).
 */

export type AdminRole = "owner" | "manager" | "franchisee" | "staff" | "kitchen";

export const ROLE_RANK: Record<AdminRole, number> = {
  owner: 100,
  franchisee: 70,
  manager: 50,
  staff: 20,
  kitchen: 10,
};

export function rankForRole(role: string): number {
  return ROLE_RANK[role as AdminRole] ?? 0;
}
