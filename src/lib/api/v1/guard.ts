import type { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "./auth";
import { apiError } from "./envelope";
import type { JwtClaims } from "./jwt";

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

/** Require a valid Bearer access token. */
export function requireOperator(req: NextRequest): Guarded {
  const claims = authenticateBearer(req);
  if (!claims) return { error: apiError("unauthorized", "Missing or invalid access token") };
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
