import type { AdminRole } from "@/lib/admin-roles";

/**
 * Role-prefixed back-office routing.
 *
 * The admin pages physically live once under `src/app/admin/*`, but each role
 * sees them under its own URL prefix so the path reads as *their* space, not
 * "admin": the owner stays on `/admin/*`, a manager sees `/manager/*`, a
 * franchisee `/franchisee/*`. `/manager/:path+` and `/franchisee/:path+` are
 * Next.js rewrites onto `/admin/:path+` (see next.config.ts), so there's one
 * source of truth — only the visible URL changes. `usePathname()` still
 * reports the visible (prefixed) path, which is what every helper here keys on.
 */
export type AdminBase = "/admin" | "/manager" | "/franchisee";

const NON_DEFAULT_BASES: AdminBase[] = ["/manager", "/franchisee"];

/** The base prefix the *current URL* is being served under. */
export function adminBaseForPath(pathname: string): AdminBase {
  for (const b of NON_DEFAULT_BASES) {
    if (pathname === b || pathname.startsWith(b + "/")) return b;
  }
  return "/admin";
}

/** The base prefix a given role should navigate within. Owner (and anyone
 *  without a dedicated portal) uses the canonical `/admin`. */
export function adminBaseForRole(role: AdminRole | string | null | undefined): AdminBase {
  if (role === "manager") return "/manager";
  if (role === "franchisee") return "/franchisee";
  return "/admin";
}

/**
 * Re-root a canonical `"/admin…"` href onto `base`. A no-op when `base` is
 * `/admin`. Only rewrites the `/admin` *page* namespace — API routes
 * (`/api/admin/*`), the other portals (`/manager`, `/terminal`) and external
 * links are returned untouched, as are non-admin paths.
 */
export function withAdminBase(base: AdminBase, href: string): string {
  if (base === "/admin") return href;
  if (href === "/admin") return base;
  if (
    href.startsWith("/admin/") ||
    href.startsWith("/admin#") ||
    href.startsWith("/admin?")
  ) {
    return base + href.slice("/admin".length);
  }
  return href;
}

/** Strip any role prefix back to the canonical `/admin…` form (for permission
 *  lookups + nav matching that key on the canonical path). */
export function canonicalAdminPath(pathname: string): string {
  const base = adminBaseForPath(pathname);
  if (base === "/admin") return pathname;
  return "/admin" + pathname.slice(base.length);
}

/* ==========================================================================
   Admin v3 variant. The v3 rebuild mounts at `/admin-v3` (the owner's HQ),
   but managers/franchisees navigate it under their own prefix — the same
   role-prefixed model as v2, just rooted at `/admin-v3` instead of `/admin`.
   `/manager/:path+` and `/franchisee/:path+` rewrite onto `/admin-v3/:path+`
   (next.config.ts), so only the visible URL differs.
   ========================================================================== */
export type AdminV3Base = "/admin-v3" | "/manager" | "/franchisee";

/** The v3 base prefix the *current URL* is being served under. */
export function adminV3BaseForPath(pathname: string): AdminV3Base {
  if (pathname === "/manager" || pathname.startsWith("/manager/")) return "/manager";
  if (pathname === "/franchisee" || pathname.startsWith("/franchisee/")) return "/franchisee";
  return "/admin-v3";
}

/** Re-root a canonical `"/admin-v3…"` href onto `base`. No-op for `/admin-v3`;
 *  leaves `/core/*`, API and external links untouched. */
export function withAdminV3Base(base: AdminV3Base, href: string): string {
  if (base === "/admin-v3") return href;
  if (href === "/admin-v3") return base;
  if (
    href.startsWith("/admin-v3/") ||
    href.startsWith("/admin-v3#") ||
    href.startsWith("/admin-v3?")
  ) {
    return base + href.slice("/admin-v3".length);
  }
  return href;
}

/** Strip any role prefix back to the canonical `/admin-v3…` form (for nav
 *  active-state matching that keys on the config hrefs). */
export function canonicalAdminV3Path(pathname: string): string {
  const base = adminV3BaseForPath(pathname);
  if (base === "/admin-v3") return pathname;
  return "/admin-v3" + pathname.slice(base.length);
}
