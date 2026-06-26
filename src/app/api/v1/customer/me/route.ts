import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api/v1/envelope";
import { requireCustomer } from "@/lib/api/v1/guard";
import type { CustomerProfileDTO } from "@/lib/api/v1/schemas";
import { getCustomer, getLoyaltySettings } from "@/lib/store";
import { calculateTier } from "@/lib/loyalty";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/customer/me` — the signed-in customer's profile + loyalty status.
 *
 * The token subject is the phone. Points come straight off the rollup's
 * `loyaltyPointsBalance` (already earned + manual — see recomputeCustomerRollup),
 * tier is derived from the live ladder. A brand-new phone that has verified but
 * never ordered resolves to a zero-state profile (Rule #6 auto-enrolment).
 */
export async function GET(req: NextRequest) {
  const guard = requireCustomer(req);
  if ("error" in guard) return guard.error;
  const phone = guard.claims.sub;

  const [customer, loyalty] = await Promise.all([getCustomer(phone), getLoyaltySettings()]);
  const points = customer?.loyaltyPointsBalance ?? 0;

  const profile: CustomerProfileDTO = {
    phone,
    name: customer?.name ?? null,
    email: customer?.email ?? null,
    points,
    tier: calculateTier(points, loyalty.tiers),
    orderCount: customer?.orderCount ?? 0,
    totalSpentGrosze: customer?.totalSpentGrosze ?? 0,
  };
  return apiOk(profile);
}
