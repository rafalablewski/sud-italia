import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getSuppliers } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/suppliers` — the vendor catalogue, mirroring web
 * `/admin/suppliers`. Suppliers are chain-wide (no per-row location), so this is
 * role-gated (manager+) rather than location-scoped.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const suppliers = [...(await getSuppliers())]; // copy before sort — getter may return a shared/cached ref
    suppliers.sort((a, b) => a.name.localeCompare(b.name));
    return apiOk(suppliers, { count: suppliers.length });
  } catch (err) {
    logger.error("v1 admin suppliers failed", { layer: "api.v1.admin.suppliers" }, err as Error);
    return apiError("internal", "Could not load suppliers");
  }
}
