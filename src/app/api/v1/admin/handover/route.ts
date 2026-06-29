import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getShiftHandovers, saveShiftHandover } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

const HANDOVER_SHIFTS = new Set(["open", "mid", "close"]);

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/handover` — shift handover log, mirroring web `/admin/handover`.
 * Manager+; location-scoped (getShiftHandovers is per-location, so we fan out
 * across the caller's allowed sites and merge). Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const { scope } = guard.claims;

  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }
  let slugs: string[];
  if (requested) slugs = [requested];
  else {
    const allowed = scopedLocations(scope);
    slugs = allowed ?? (await getActiveLocationsAsync()).map((l) => l.slug);
  }

  try {
    const lists = await Promise.all(slugs.map((s) => getShiftHandovers(s, { limit: 50 })));
    const entries = lists
      .flat()
      .map((h) => ({
        id: h.id,
        locationSlug: h.locationSlug,
        shift: h.shift,
        outgoingManager: h.outgoingManager,
        incomingManager: h.incomingManager ?? null,
        cashVarianceGrosze: h.cashVarianceGrosze ?? null,
        tempChecksOk: h.tempChecksOk,
        equipmentOk: h.equipmentOk,
        managerComment: h.managerComment ?? null,
        recordedAt: h.recordedAt,
      }))
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return apiOk(entries, { count: entries.length });
  } catch (err) {
    logger.error("v1 admin handover failed", { layer: "api.v1.admin.handover" }, err as Error);
    return apiError("internal", "Could not load handovers");
  }
}

/**
 * `POST /api/v1/admin/handover` — record a shift handover, mirroring the web
 * `/admin/handover` form. Body `{ locationSlug, shift, outgoingManager,
 * tempChecksOk, equipmentOk, wasteNoted?, incomingManager?, managerComment? }`.
 * `shift` ∈ {open, mid, close}. Manager+; the location must be in scope.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: {
    locationSlug?: string;
    shift?: string;
    outgoingManager?: string;
    incomingManager?: string;
    tempChecksOk?: boolean;
    equipmentOk?: boolean;
    wasteNoted?: boolean;
    managerComment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const loc = String(body.locationSlug ?? "").trim().toLowerCase();
  const shift = String(body.shift ?? "");
  const outgoing = String(body.outgoingManager ?? "").trim().slice(0, 120);
  if (!loc || !HANDOVER_SHIFTS.has(shift) || !outgoing) {
    return apiError("validation_failed", "locationSlug, a valid shift and outgoingManager are required");
  }
  if (typeof body.tempChecksOk !== "boolean" || typeof body.equipmentOk !== "boolean") {
    return apiError("validation_failed", "tempChecksOk and equipmentOk must be booleans");
  }
  if (!scopeAllows(guard.claims.scope, loc)) {
    return apiError("forbidden", `Not authorized for location "${loc}"`);
  }

  try {
    const entry = await saveShiftHandover({
      locationSlug: loc,
      shift: shift as "open" | "mid" | "close",
      outgoingManager: outgoing,
      incomingManager:
        typeof body.incomingManager === "string" && body.incomingManager.trim()
          ? body.incomingManager.trim().slice(0, 120)
          : undefined,
      tempChecksOk: body.tempChecksOk,
      equipmentOk: body.equipmentOk,
      wasteNoted: body.wasteNoted === true,
      managerComment:
        typeof body.managerComment === "string" && body.managerComment.trim()
          ? body.managerComment.trim().slice(0, 500)
          : undefined,
      recordedBy: guard.claims.name ?? guard.claims.sub,
    });
    return apiOk(
      {
        id: entry.id,
        locationSlug: entry.locationSlug,
        shift: entry.shift,
        outgoingManager: entry.outgoingManager,
        incomingManager: entry.incomingManager ?? null,
        cashVarianceGrosze: entry.cashVarianceGrosze ?? null,
        tempChecksOk: entry.tempChecksOk,
        equipmentOk: entry.equipmentOk,
        managerComment: entry.managerComment ?? null,
        recordedAt: entry.recordedAt,
      },
      undefined,
      201,
    );
  } catch (err) {
    logger.error("v1 admin handover create failed", { layer: "api.v1.admin.handover" }, err as Error);
    return apiError("internal", "Could not record the handover");
  }
}
