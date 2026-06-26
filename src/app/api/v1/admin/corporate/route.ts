import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { listCorporateWallets } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/corporate` — corporate / B2B accounts, mirroring web
 * `/admin/corporate`. Manager+.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const wallets = await listCorporateWallets();
    const list = wallets
      .filter((w) => w.corporate)
      .map((w) => ({
        id: w.id,
        name: w.corporate!.name,
        slug: w.corporate!.slug,
        memberCount: w.members.length,
        billingEmail: w.corporate!.billingEmail ?? null,
        locationSlug: w.corporate!.locationSlug ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin corporate failed", { layer: "api.v1.admin.corporate" }, err as Error);
    return apiError("internal", "Could not load corporate accounts");
  }
}
