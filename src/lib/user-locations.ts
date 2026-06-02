import type { AdminUser } from "@/data/types";

/**
 * Canonical resolver for which locations an admin account is scoped to.
 *
 * A manager can run multiple sites, so `locationSlugs` (array) is authoritative;
 * the legacy single `locationSlug` is the fallback for accounts created before
 * multi-location. An empty result means "all locations" (owners, unscoped
 * accounts) — never restrict on an empty list.
 *
 * Client-safe leaf (type-only import) so the login route, the store, the Users
 * editor and the matrix all derive the scope the same way.
 */
export function userLocationSlugs(
  u: Pick<AdminUser, "locationSlug" | "locationSlugs">,
): string[] {
  if (Array.isArray(u.locationSlugs) && u.locationSlugs.length > 0) {
    return u.locationSlugs;
  }
  if (u.locationSlug) return [u.locationSlug];
  return [];
}

/** True when the account has no location restriction (sees every site). */
export function userScopesAllLocations(
  u: Pick<AdminUser, "locationSlug" | "locationSlugs">,
): boolean {
  return userLocationSlugs(u).length === 0;
}

/** True when the account is authorized for `slug` (or scoped to all sites). */
export function userCoversLocation(
  u: Pick<AdminUser, "locationSlug" | "locationSlugs">,
  slug: string,
): boolean {
  const slugs = userLocationSlugs(u);
  return slugs.length === 0 || slugs.includes(slug);
}

// Wire format for "every site" in a session token — mirrors
// LOCATION_SCOPE_ALL in admin-auth.ts (kept here so this client-safe leaf has
// no server dependency; admin-auth re-exports sessionLocationScope).
const ALL_SITES = "*";

/**
 * The session location-scope string an account should be issued, derived once
 * here so EVERY login path mints it identically: owners (and genuinely
 * unscoped accounts) get `"*"`; everyone else a comma-joined list of their
 * assigned sites via {@link userLocationSlugs} (array first, legacy singular
 * fallback).
 *
 * This exists because the bug it fixes was three copies of the logic that
 * drifted: the password login used `userLocationSlugs`, but the PIN-terminal
 * and passkey logins read the raw singular `user.locationSlug` and fell back to
 * `"*"` when it was empty — so a manager whose sites lived in the array field
 * was scoped to one site by password but EVERY site by PIN/passkey. One
 * resolver makes that impossible.
 */
export function sessionLocationScope(
  u: Pick<AdminUser, "role" | "locationSlug" | "locationSlugs">,
): string {
  if (u.role === "owner") return ALL_SITES;
  const slugs = userLocationSlugs(u);
  return slugs.length > 0 ? slugs.join(",") : ALL_SITES;
}
