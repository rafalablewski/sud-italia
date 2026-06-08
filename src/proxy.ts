import { NextResponse, type NextRequest } from "next/server";

/**
 * Admin route shims.
 *
 * The owner back-office is the canonical `/admin` surface — there is no
 * `/admin-v3` route. "Admin is always one": the v3 rebuild is the
 * *implementation* mounted under `src/app/admin/(shell)/*`, swappable to a
 * future v4/v5 without ever changing the visible URL. So this middleware no
 * longer redirects `/admin` anywhere; it only smooths over two edges:
 *
 *   1. The capabilities ledger lives at the standalone, shell-less
 *      `/capabilities` route, so `/admin/capabilities` redirects there (keeps
 *      old bookmarks + the nav link working).
 *   2. A handful of legacy *detail* URLs have no 1:1 page in the v3 rebuild —
 *      the detail views became dialogs opened from their parent list. Those
 *      fold onto the parent instead of 404ing.
 *
 * Everything else under `/admin/*` is a real page and passes straight through.
 * Manager / franchisee portals rewrite onto `/admin/*` in next.config.ts.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The ledger lives on its own shell-less route.
  if (pathname === "/admin/capabilities" || pathname.startsWith("/admin/capabilities/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/capabilities";
    return NextResponse.redirect(url, 307);
  }

  // Folded routes — no 1:1 page (the detail views became dialogs on the parent
  // list). Land on the parent instead of 404ing.
  let dest: string | null = null;
  if (pathname.startsWith("/admin/")) {
    const rest = pathname.slice("/admin/".length);
    if (rest.startsWith("customers/")) dest = "/admin/customers"; // detail → dialog
    else if (rest.startsWith("menu/")) dest = "/admin/menu"; // edit → dialog
    else if (rest === "reports/cohort" || rest === "reports/ltv-cac") dest = "/admin/reports"; // → Calculator sandboxes
  }
  if (!dest) return NextResponse.next();

  const url = req.nextUrl.clone(); // preserves ?query
  url.pathname = dest;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/admin/:path*"],
};
