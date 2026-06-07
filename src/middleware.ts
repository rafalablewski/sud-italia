import { NextResponse, type NextRequest } from "next/server";

/**
 * Admin v3 cutover — reversible.
 *
 * The owner back-office now serves the **v3** rebuild: every `/admin/*` request
 * 307-redirects to the matching `/admin-v3/*` route. To fall straight back to
 * v2, delete this file and revert `landingPathForRole` (owner → "/admin"). v2 is
 * left untouched in the tree (TODO §Cutover step 2: "swap … reversible; keeps v2").
 *
 * Pass-throughs (intentionally stay on v2):
 *   - `/admin/capabilities` — the shared deploy ledger (Rule #9 source of truth)
 *     that the v3 nav links to; not a themed surface worth rebuilding.
 *   - `/admin/login` — the owner login page; v3 reuses it as-is.
 *
 * Manager / franchisee portals are **unaffected**: they rewrite to `/admin/*`
 * (v2) in `next.config.ts`, and v3 has no role-prefix support yet
 * (`nav.config.ts` → `P = "/admin-v3"`). The matcher below only fires on
 * `/admin` + `/admin/*`, so `/manager/*` and `/franchisee/*` never reach here.
 *
 * Folded routes (no 1:1 v3 page — the detail views became dialogs) land on
 * their v3 parent instead of 404ing.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pass-throughs — keep serving v2.
  if (pathname === "/admin/capabilities" || pathname.startsWith("/admin/capabilities/")) {
    return NextResponse.next();
  }
  if (pathname === "/admin/login") return NextResponse.next();

  let dest: string | null = null;
  if (pathname === "/admin") {
    dest = "/admin-v3";
  } else if (pathname.startsWith("/admin/")) {
    const rest = pathname.slice("/admin/".length);
    if (rest.startsWith("customers/")) dest = "/admin-v3/customers"; // detail → dialog
    else if (rest.startsWith("menu/")) dest = "/admin-v3/menu"; // edit → dialog
    else if (rest === "reports/cohort" || rest === "reports/ltv-cac") dest = "/admin-v3/reports"; // → Calculator sandboxes
    else dest = "/admin-v3/" + rest;
  }
  if (!dest) return NextResponse.next();

  const url = req.nextUrl.clone(); // preserves ?query
  url.pathname = dest;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
