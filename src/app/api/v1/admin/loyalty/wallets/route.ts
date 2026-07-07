import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getAdminWalletSummaries } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/loyalty/wallets` — the family-wallet ledger for the native
 * Guest · Loyalty · Wallets tab (web `CoreLoyalty` Wallets). Each wallet's head,
 * member roster (with per-member contributed points) and the shared spendable
 * pool (earned − redeemed), all from real loyalty/order state via the shared
 * `getAdminWalletSummaries` (Rule #1 — no mock). Manager+ (guest PII + points).
 * Wallets are chain-wide (a family orders across locations), so this isn't
 * location-scoped — matching the web route.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const wallets = await getAdminWalletSummaries();
    return apiOk(wallets, { count: wallets.length });
  } catch (err) {
    logger.error("v1 loyalty wallets failed", { layer: "api.v1.admin.loyalty.wallets" }, err as Error);
    return apiError("internal", "Could not load wallets");
  }
}
