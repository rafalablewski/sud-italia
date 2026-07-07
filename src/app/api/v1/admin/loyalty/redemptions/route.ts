import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getWalletRedemptions } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/loyalty/redemptions` — the points-redemption ledger for the
 * native Guest · Loyalty · Redemptions tab (web `CoreLoyalty` Redemptions).
 * Newest first; `walletId` null = a solo (non-wallet) redemption. Real ledger via
 * the shared `getWalletRedemptions` (Rule #1). Manager+; chain-wide (loyalty is
 * not per-site), matching the web route.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const rows = (await getWalletRedemptions())
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return apiOk(rows, { count: rows.length });
  } catch (err) {
    logger.error("v1 loyalty redemptions failed", { layer: "api.v1.admin.loyalty.redemptions" }, err as Error);
    return apiError("internal", "Could not load redemptions");
  }
}
