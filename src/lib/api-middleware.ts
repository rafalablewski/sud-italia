import { NextRequest, NextResponse } from "next/server";
import {
  type AdminRole,
  getCurrentAdminUser,
  hasLocationAccess,
  LOCATION_SCOPE_ALL,
  ROLE_RANK,
} from "@/lib/admin-auth";
import {
  permissionForApiPath,
  resolveEffectivePermissions,
} from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { deriveRequestId, runWithRequestContext } from "@/lib/request-context";
import { enforceRateLimit, getClientIp, isAdminIpAllowed } from "@/lib/rate-limit";

/**
 * Per-user ceiling on admin API calls, applied by withAdmin to every wrapped
 * route. Generous enough that a dashboard firing a dozen fetches per page load
 * never trips it, low enough that a runaway script or stolen session is
 * throttled. Override with ADMIN_RATE_LIMIT_PER_MIN.
 */
function adminRateLimitPerMin(): number {
  const raw = Number.parseInt(process.env.ADMIN_RATE_LIMIT_PER_MIN ?? "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 300;
}

/**
 * Drop-in wrapper for /api/admin/* route handlers. Replaces the
 * `isAuthenticated()` call at the top of ~70 admin routes with a single
 * declaration that also enforces role and per-location tenancy.
 *
 * Today every admin route trusts whatever ?location=<slug> the caller sends.
 * A Kraków-only staff session can call `/api/admin/orders?location=warszawa`
 * and the API returns Warszawa orders. The audit flagged this as
 * filter-based-not-enforced tenancy. withAdmin closes that hole when the
 * route declares a `locationParam`.
 *
 * Example usage:
 *
 *   // Route with a ?location= query param and a role gate.
 *   export const GET = withAdmin(
 *     { roles: ["staff"], locationParam: "location" },
 *     async (req, _ctx, { user, locationSlug }) => {
 *       // user.role, user.id, locationSlug ("krakow" etc) all enforced
 *       return NextResponse.json({ ... });
 *     },
 *   );
 *
 *   // Dynamic route with the location embedded in a path param.
 *   export const PATCH = withAdmin<{ params: Promise<{ slug: string }> }>(
 *     {
 *       roles: ["manager"],
 *       locationParam: async (_req, ctx) => (await ctx.params).slug,
 *     },
 *     async (req, ctx, { user, locationSlug }) => { ... },
 *   );
 *
 *   // Cross-location route (HQ rollup) — pin to owner only.
 *   export const GET = withAdmin(
 *     { roles: ["owner"] },
 *     async (req, _ctx, { user }) => { ... },
 *   );
 */

export interface AdminAuthContext {
  user: {
    id: string;
    name: string;
    email?: string;
    role: AdminRole;
    /** Custom granular grant, when the account carries one (else undefined). */
    permissions?: string[];
  };
  /** The location slug enforced for this request, or null when not scoped. */
  locationSlug: string | null;
}

type LocationExtractor<RouteCtx> = (
  req: NextRequest,
  ctx: RouteCtx,
) => string | null | Promise<string | null>;

export interface WithAdminOptions<RouteCtx> {
  /**
   * If set, requires the session role to be at least as privileged as the
   * least-privileged role in this list. Omit for any-authenticated.
   */
  roles?: AdminRole[];
  /**
   * If set, the route is treated as scoped to a single location and
   * requireLocationAccess is enforced. Accepts either a query/searchParam
   * name or a custom extractor (for path params, JSON body fields, etc).
   *
   * Omit for routes that legitimately span all locations — but pair such
   * routes with `roles: ["owner"]` so a scoped staff user can't see all
   * locations' data.
   */
  locationParam?: string | LocationExtractor<RouteCtx>;
}

export type AdminRouteHandler<RouteCtx> = (
  req: NextRequest,
  ctx: RouteCtx,
  auth: AdminAuthContext,
) => Promise<Response> | Response;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

async function resolveLocationSlug<RouteCtx>(
  param: string | LocationExtractor<RouteCtx>,
  req: NextRequest,
  ctx: RouteCtx,
): Promise<string | null> {
  if (typeof param === "function") return param(req, ctx);
  const raw = req.nextUrl.searchParams.get(param);
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  // Sanity-check the shape — slugs are alphanum + hyphen. A request with
  // ?location=*  must not collapse to the wildcard.
  if (!/^[a-z0-9-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function withAdmin<RouteCtx = { params: Promise<Record<string, never>> }>(
  opts: WithAdminOptions<RouteCtx>,
  handler: AdminRouteHandler<RouteCtx>,
): (req: NextRequest, ctx: RouteCtx) => Promise<Response> {
  return async (req, ctx) => {
    // Network gate first — cheapest deny, and it runs before we touch the
    // session or DB. When ADMIN_IP_ALLOWLIST is unset this is a no-op.
    if (!isAdminIpAllowed(getClientIp(req))) {
      return forbidden("Access from this network is not allowed");
    }

    const user = await getCurrentAdminUser();
    if (!user) return unauthorized();

    // Per-user rate limit across the whole admin surface. Keyed by user id so
    // one operator's runaway tab can't exhaust another's budget. Login has its
    // own stricter 5/min/IP limiter; this covers every other admin route.
    const limited = await enforceRateLimit({
      key: "admin-api",
      id: user.id,
      limit: adminRateLimitPerMin(),
      windowSec: 60,
    });
    if (limited) return limited;

    // Authorization. Granular permissions and the legacy role-rank gate are
    // reconciled here so the two systems never contradict each other:
    //
    //  - owner / legacy shared session → all-access, both gates skipped;
    //  - a user with a CUSTOM permission grant → permissions are
    //    authoritative. If this route's path maps to a permission, require it
    //    (ignoring role rank, so an owner can grant a staff user a single
    //    manager-tier capability). If the path is unmapped, fall back to the
    //    declared role gate so an unmapped route is never left wide open;
    //  - everyone else (role-default users) → the existing role-rank gate.
    const eff = resolveEffectivePermissions(user);
    if (!eff.all) {
      const enforceRoleGate = () => {
        if (opts.roles && opts.roles.length > 0) {
          const minRank = Math.min(...opts.roles.map((r) => ROLE_RANK[r]));
          if (ROLE_RANK[user.role] < minRank) {
            return forbidden(`Requires role ${opts.roles.join("|")}`);
          }
        }
        return null;
      };

      if (eff.custom) {
        const needed = permissionForApiPath(req.nextUrl.pathname, req.method);
        if (needed) {
          if (!eff.keys.has(needed)) {
            return forbidden(`Requires permission ${needed}`);
          }
        } else {
          const denied = enforceRoleGate();
          if (denied) return denied;
        }
      } else {
        const denied = enforceRoleGate();
        if (denied) return denied;
      }
    }

    let locationSlug: string | null = null;
    if (opts.locationParam !== undefined) {
      locationSlug = await resolveLocationSlug(opts.locationParam, req, ctx);
      if (locationSlug) {
        // Caller supplied a slug — must be in their session scope.
        const allowed = await hasLocationAccess(locationSlug);
        if (!allowed) {
          return forbidden(
            `Session is not authorized for location "${locationSlug}"`,
          );
        }
      } else {
        // No slug = cross-location read (HQ rollup, "all locations" view).
        // Only allow when the session holds unrestricted scope. Routes that
        // want to FORBID this entirely should pair with roles: ["owner"]
        // and/or hand-validate in the handler.
        const allowed = await hasLocationAccess(LOCATION_SCOPE_ALL);
        if (!allowed) {
          return forbidden(
            "Cross-location access requires unrestricted scope",
          );
        }
      }
    }

    // Set the per-request context so every log line + audit entry inside
    // the handler gets requestId / userId / locationSlug for free.
    const requestId = deriveRequestId(req.headers.get("x-request-id"));
    return runWithRequestContext(
      {
        requestId,
        userId: user.id,
        locationSlug,
        path: req.nextUrl.pathname,
        method: req.method,
      },
      async () => {
        try {
          return await handler(req, ctx, { user, locationSlug });
        } catch (err) {
          // The handler itself is responsible for catching its own
          // expected errors; this is the last-ditch net so a thrown error
          // doesn't leak a stack trace to the client. Mirrors the
          // existing try/catch idiom in most of the admin routes.
          logger.error("withAdmin handler threw", { layer: "withAdmin" }, err);
          return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    );
  };
}

export { LOCATION_SCOPE_ALL };
