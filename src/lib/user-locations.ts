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
