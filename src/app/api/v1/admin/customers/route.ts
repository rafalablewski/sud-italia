import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getCustomers } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/customers` — the CRM roster for the operator app, mirroring
 * the web `/admin/customers` page. Customer rollups are chain-wide (no per-row
 * location), so this is gated by role (staff+) rather than location scope. Money
 * stays in grosze; the app formats via MoneyText.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  try {
    const customers = await getCustomers();
    customers.sort((a, b) => b.totalSpentGrosze - a.totalSpentGrosze);
    return apiOk(customers, { count: customers.length });
  } catch (err) {
    logger.error("v1 admin customers failed", { layer: "api.v1.admin.customers" }, err as Error);
    return apiError("internal", "Could not load customers");
  }
}
