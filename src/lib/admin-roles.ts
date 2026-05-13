/**
 * Role primitives extracted from admin-auth.ts so client components
 * (nav.config.ts, sidebar filters) can import the type + rank table
 * without pulling in next/headers, crypto, or store.ts — those are
 * server-only and break the client bundle (async_hooks).
 *
 * admin-auth.ts re-exports these so existing imports keep working.
 */

export type AdminRole = "owner" | "manager" | "franchisee" | "staff" | "kitchen";

export const ROLE_RANK: Record<AdminRole, number> = {
  owner: 100,
  // m3_2 franchisee tier — between manager and owner. Has full
  // read-everything power inside their own scope but never see other
  // franchisees' data. m0_5 locationScope claim is what enforces the
  // tenancy; the rank only governs role-gated UI like settings, users,
  // and admin-only HQ rollups.
  franchisee: 70,
  manager: 50,
  staff: 20,
  kitchen: 10,
};
