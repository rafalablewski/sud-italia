import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrCreateReferralCode,
  getReferralCodeOwner,
  getReferralStats,
  recordRedemptionIntent,
  REFEREE_DISCOUNT_GROSZE,
  REFERRER_REWARD_POINTS,
} from "@/lib/referral-loop";

/**
 * Public referral endpoint backing the customer-facing /rewards page,
 * the order-confirmation share card, and the /r/[code] landing page.
 *
 * GET   ?phone=<phone>  → fetch (or create) the customer's own code +
 *                          their give-get stats.
 * POST  { code, refereePhone } → record a redemption intent (called by
 *                                the cart drawer when a referral code
 *                                is keyed in or arrives via /r/<code>).
 *
 * No admin auth here — these are customer endpoints. Rate-limiting is
 * handled by the existing public rate-limit middleware.
 */

const postSchema = z.object({
  code: z.string().min(4).max(12),
  refereePhone: z.string().min(6).max(20),
});

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json(
      { error: "missing_phone", policy: { rewardPoints: REFERRER_REWARD_POINTS, discountGrosze: REFEREE_DISCOUNT_GROSZE } },
      { status: 400 },
    );
  }
  const { code } = await getOrCreateReferralCode(phone);
  const stats = await getReferralStats(phone);
  return NextResponse.json({
    code,
    stats,
    policy: {
      rewardPoints: REFERRER_REWARD_POINTS,
      discountGrosze: REFEREE_DISCOUNT_GROSZE,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const owner = await getReferralCodeOwner(parsed.data.code);
  if (!owner) {
    return NextResponse.json({ error: "unknown_code" }, { status: 404 });
  }
  const result = await recordRedemptionIntent(
    parsed.data.code,
    parsed.data.refereePhone,
  );
  if (result.status === "self_referral") {
    return NextResponse.json({ error: "self_referral" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    discountGrosze: REFEREE_DISCOUNT_GROSZE,
    ownerName: owner.ownerName,
  });
}
