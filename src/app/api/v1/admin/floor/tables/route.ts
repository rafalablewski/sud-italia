import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getTables } from "@/lib/store";
import type { FloorTableDTO } from "@/lib/api/v1/schemas";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/floor/tables?location=` — the floor tables for the POS
 * dine-in table picker, the native twin of web `/api/admin/floor/tables` (GET).
 * Read-only on v1 (managers configure tables on the web); staff+ since the POS
 * table picker is a staff action. Location-scoped + required.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
  if (!loc) return apiError("validation_failed", "location is required");
  if (!scopeAllows(guard.claims.scope, loc)) {
    return apiError("forbidden", `Not authorized for location "${loc}"`);
  }
  try {
    const tables: FloorTableDTO[] = (await getTables(loc)).map((t) => ({
      id: t.id,
      number: t.number,
      seats: t.seats,
      zone: t.zone ?? null,
      status: t.status,
      notes: t.notes ?? null,
    }));
    return apiOk(tables, { location: loc, count: tables.length });
  } catch (err) {
    logger.error("v1 floor tables failed", { layer: "api.v1.admin.floor.tables" }, err as Error);
    return apiError("internal", "Could not load tables");
  }
}
