import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getPosTab, getPosTabs, savePosTab, deletePosTab } from "@/lib/store";
import type { PosTabLine, PosTabStatus, FulfillmentType } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `/api/v1/admin/pos/tabs` — server-backed open checks (Tabs POS), the native
 * twin of `/api/admin/pos/tabs`. Several concurrent checks per till, persisted so
 * they survive a refresh and are shared across tills at one location. Lines carry
 * menu-item id + quantity (+ course) only — prices + discounts are resolved
 * server-side at send/charge, never dictated by the till. Staff+, location-scoped.
 *
 *   GET    ?location=        → list this location's open checks
 *   POST   ?location= {name} → start a new (empty) open check
 *   PUT    { id, … }         → edit a check (items / channel / table / covers / …)
 *   DELETE ?id=&location=    → void a check
 */

function resolveLocation(req: NextRequest, scope: string): string | { error: ReturnType<typeof apiError> } {
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (!requested) return { error: apiError("validation_failed", "location is required") };
  if (!scopeAllows(scope, requested)) return { error: apiError("forbidden", `Not authorized for location "${requested}"`) };
  return requested;
}

export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  try {
    return apiOk(await getPosTabs(loc), { location: loc });
  } catch (err) {
    logger.error("v1 pos tabs list failed", { layer: "api.v1.admin.pos.tabs" }, err as Error);
    return apiError("internal", "Could not load tabs");
  }
}

export async function POST(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "New tab";
  try {
    const tab = await savePosTab({ locationSlug: loc, name, status: "open", items: [] });
    return apiOk(tab, undefined, 201);
  } catch (err) {
    logger.error("v1 pos tab create failed", { layer: "api.v1.admin.pos.tabs" }, err as Error);
    return apiError("internal", "Could not open a tab");
  }
}

interface TabPut {
  id?: string;
  locationSlug?: string;
  name?: string;
  channel?: FulfillmentType | null;
  status?: PosTabStatus;
  items?: PosTabLine[];
  tableId?: string;
  covers?: number;
  address?: string;
  customerPhone?: string;
  customerName?: string;
  coursed?: boolean;
}

export async function PUT(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  let body: TabPut;
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const loc = body.locationSlug?.trim().toLowerCase();
  if (!body.id || !loc) return apiError("validation_failed", "id and locationSlug are required");
  if (!scopeAllows(guard.claims.scope, loc)) return apiError("forbidden", `Not authorized for location "${loc}"`);

  // Scope the write to the caller's location — a till can't overwrite another
  // location's check by passing its id. `mustExist` makes PUT an edit, never a
  // create (a PUT landing after a void won't resurrect the check).
  const existing = await getPosTab(body.id, loc);
  if (existing && existing.locationSlug !== loc) return apiError("not_found", "Tab not found");
  try {
    const tab = await savePosTab(
      {
        id: body.id,
        locationSlug: loc,
        name: body.name,
        channel: body.channel ?? null,
        status: body.status,
        items: body.items,
        tableId: body.tableId,
        covers: body.covers,
        address: body.address,
        customerPhone: body.customerPhone,
        customerName: body.customerName,
        coursed: body.coursed,
      },
      { mustExist: true },
    );
    if (!tab) return apiError("not_found", "Tab not found");
    return apiOk(tab);
  } catch (err) {
    logger.error("v1 pos tab save failed", { layer: "api.v1.admin.pos.tabs" }, err as Error);
    return apiError("internal", "Could not save the tab");
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return apiError("validation_failed", "id is required");
  const tab = await getPosTab(id, loc);
  if (!tab || tab.locationSlug !== loc) return apiError("not_found", "Tab not found");
  try {
    const ok = await deletePosTab(id, loc);
    if (!ok) return apiError("not_found", "Tab not found");
    return apiOk({ deleted: true, id });
  } catch (err) {
    logger.error("v1 pos tab delete failed", { layer: "api.v1.admin.pos.tabs" }, err as Error);
    return apiError("internal", "Could not void the tab");
  }
}
