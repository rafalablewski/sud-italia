import type { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "./auth";
import { apiError } from "./envelope";
import type { JwtClaims } from "./jwt";
import { ROLE_RANK, type AdminRole } from "@/lib/admin-roles";

/**
 * Operator-route guard for `/api/v1`.
 *
 * The access token carries the same location scope as the web cookie ("*" or a
 * comma-joined slug list, HMAC-bound at issue). These helpers enforce it so a
 * Kraków-scoped operator can't read or mutate Warszawa orders by changing a
 * query param — the native analogue of requireLocationAccess (admin-auth.ts).
 * Presentation gating happens client-side; THIS is the real boundary.
 */

export type Guarded = { claims: JwtClaims } | { error: NextResponse };

/** Require a valid Bearer access token (any audience). */
export function requireOperator(req: NextRequest): Guarded {
  const claims = authenticateBearer(req);
  if (!claims) return { error: apiError("unauthorized", "Missing or invalid access token") };
  return { claims };
}

/**
 * Require an operator whose role rank meets a minimum — the v1 twin of the web
 * admin's role gate (`ROLE_RANK` in admin-roles.ts, the same table the sidebar
 * uses via `filterNavForRoleV3`). Use this on `/api/v1/admin/*` data routes so a
 * kitchen-rank token can't read finance/CRM surfaces it can't see on the web.
 */
export function requireRole(req: NextRequest, min: AdminRole): Guarded {
  const guard = requireOperator(req);
  if ("error" in guard) return guard;
  const role = guard.claims.role as AdminRole;
  const rank = ROLE_RANK[role] ?? 0;
  if (rank < ROLE_RANK[min]) {
    return { error: apiError("forbidden", `Requires ${min} role or higher`) };
  }
  return guard;
}

/**
 * Resolve the location filter for an operator data read, honoring token scope.
 * - explicit `?location=` (validated against scope) → just that slug
 * - no param, unrestricted ("*") → null (chain-wide)
 * - no param, scoped → the allowed slug list
 * Returns `{ error }` when the requested location is outside scope.
 */
export function resolveLocationFilter(
  req: NextRequest,
  scope: string,
): { slugs: string[] | null } | { error: NextResponse } {
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested) {
    if (!scopeAllows(scope, requested)) {
      return { error: apiError("forbidden", `Not authorized for location "${requested}"`) };
    }
    return { slugs: [requested] };
  }
  return { slugs: scopedLocations(scope) }; // null = unrestricted
}

/** Require a valid CUSTOMER token (Ottaviano app). The subject is the phone. */
export function requireCustomer(req: NextRequest): Guarded {
  const claims = authenticateBearer(req);
  if (!claims) return { error: apiError("unauthorized", "Missing or invalid access token") };
  if (claims.aud !== "ottaviano" || claims.role !== "customer") {
    return { error: apiError("forbidden", "Customer token required") };
  }
  return { claims };
}

/** True when a scope string authorizes a given location slug. */
export function scopeAllows(scope: string, locationSlug: string): boolean {
  if (scope === "*") return true;
  return scope
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(locationSlug);
}

/** The concrete location slugs a scope covers, or null for unrestricted ("*"). */
export function scopedLocations(scope: string): string[] | null {
  if (scope === "*") return null;
  return scope.split(",").map((s) => s.trim()).filter(Boolean);
}
