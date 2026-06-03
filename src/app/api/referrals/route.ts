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
import { normalizePlPhoneE164 } from "@/lib/phone";

/**
 * Public referral endpoint backing the customer-facing /rewards page,
 * the order-confirmation share card, and the /r/[code] landing page.
 *
 * GET   ?phone=<phone>  → fetch (or create) the customer's own code +
 *                          their give-get stats.
 * GET   ?code=<code>[&phone=<phone>] → non-recording validation for the
 *                          cart drawer: does the code resolve to a real
 *                          owner, and is it a self-referral? Used to show
 *                          the "−10 zł, referred by X" line before
 *                          checkout. Recording happens only server-side
 *                          at checkout (createOrderFromCart), so there's
 *                          exactly one pending intent per redemption.
 * POST  { code, refereePhone } → record a redemption intent (legacy
 *                          callers / explicit claim).
 *
 * No admin auth here — these are customer endpoints. Rate-limiting is
 * handled by the existing public rate-limit middleware.
 */

const postSchema = z.object({
  code: z.string().min(4).max(12),
  refereePhone: z.string().min(6).max(20),
});

export async function GET(req: NextRequest) {
  const codeParam = req.nextUrl.searchParams.get("code");
  // Validation mode (non-recording) — the cart drawer asks "is this code
  // real, and whose is it?" so it can show the give-get line. It never
  // records here; createOrderFromCart records the single pending intent.
  if (codeParam) {
    const owner = await getReferralCodeOwner(codeParam);
    if (!owner) {
      return NextResponse.json({ valid: false, reason: "unknown_code" }, { status: 200 });
    }
    const refereePhone = req.nextUrl.searchParams.get("phone");
    const normalizedReferee = refereePhone ? normalizePlPhoneE164(refereePhone) : null;
    const selfReferral = !!normalizedReferee && normalizedReferee === owner.ownerPhone;
    return NextResponse.json({
      valid: !selfReferral,
      selfReferral,
      ownerName: owner.ownerName || null,
      discountGrosze: REFEREE_DISCOUNT_GROSZE,
    });
  }

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
