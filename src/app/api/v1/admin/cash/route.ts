import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import { getCashSessions, openCashSession } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/cash` — till sessions, mirroring web `/admin/cash`. Manager+;
 * location-scoped. Returns a per-session summary (float, drops, variance, state).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getCashSessions();
    const sessions = (filter.slugs === null ? all : all.filter((s) => filter.slugs!.includes(s.locationSlug)))
      .map((s) => ({
        id: s.id,
        locationSlug: s.locationSlug,
        openedAt: s.openedAt,
        openedBy: s.openedBy,
        openingFloat: s.openingFloat,
        dropCount: s.drops.length,
        dropsTotal: s.drops.reduce((sum, d) => sum + d.amountGrosze, 0),
        closingCountGrosze: s.closingCountGrosze ?? null,
        varianceGrosze: s.varianceGrosze ?? null,
        closedAt: s.closedAt ?? null,
        open: s.closedAt == null,
      }))
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
    return apiOk(sessions, { count: sessions.length, open: sessions.filter((s) => s.open).length });
  } catch (err) {
    logger.error("v1 admin cash failed", { layer: "api.v1.admin.cash" }, err as Error);
    return apiError("internal", "Could not load cash sessions");
  }
}

/**
 * `POST /api/v1/admin/cash` — open a till session, mirroring web `/admin/cash`
 * POST. Body `{ locationSlug, openingFloat (grosze), notes? }`. Manager+; the
 * location must be in scope. 409 if a session is already open there.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { locationSlug?: string; openingFloat?: number; notes?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const loc = String(body.locationSlug ?? "").trim().toLowerCase();
  const openingFloat = Number(body.openingFloat);
  if (!loc || !Number.isInteger(openingFloat) || openingFloat < 0 || openingFloat > 1_000_000) {
    return apiError("validation_failed", "locationSlug and openingFloat (grosze) are required");
  }
  if (!scopeAllows(guard.claims.scope, loc)) {
    return apiError("forbidden", `Not authorized for location "${loc}"`);
  }
  try {
    const result = await openCashSession({
      locationSlug: loc,
      openingFloat,
      openedBy: guard.claims.name ?? guard.claims.sub,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || undefined : undefined,
    });
    if ("error" in result) {
      return apiError("conflict", "A cash session is already open for this location");
    }
    return apiOk(
      {
        id: result.id,
        locationSlug: result.locationSlug,
        openedAt: result.openedAt,
        openedBy: result.openedBy,
        openingFloat: result.openingFloat,
        dropCount: result.drops.length,
        dropsTotal: result.drops.reduce((sum, d) => sum + d.amountGrosze, 0),
        closingCountGrosze: result.closingCountGrosze ?? null,
        varianceGrosze: result.varianceGrosze ?? null,
        closedAt: result.closedAt ?? null,
        open: result.closedAt == null,
      },
      undefined,
      201,
    );
  } catch (err) {
    logger.error("v1 admin cash open failed", { layer: "api.v1.admin.cash" }, err as Error);
    return apiError("internal", "Could not open the session");
  }
}
