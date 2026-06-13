import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getReferralCodeOwner, REFEREE_DISCOUNT_GROSZE } from "@/lib/referral-loop";
import { getLoyaltySettings } from "@/lib/store";

/**
 * Public referral landing: /r/ABC123 → drops a cookie noting the
 * incoming code, then sends the visitor to the home page with a
 * banner-triggering query param. Cart drawer reads the cookie at
 * checkout and applies the referee discount.
 *
 * Server component so the cookie hit is one round-trip, not two.
 */
export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();
  const owner = await getReferralCodeOwner(upper);
  if (!owner) {
    redirect("/?ref=invalid");
  }
  const cookieStore = await cookies();
  cookieStore.set("sud-italia-referral", upper, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: false, // cart drawer reads this client-side
    sameSite: "lax",
    path: "/",
  });
  // Operator-set referee discount (admin: /admin/growth → Referrals); const is
  // the first-deploy fallback. Keeps the landing banner in step with checkout.
  const refereeDiscountGrosze = (await getLoyaltySettings()).referral.refereeDiscountGrosze ?? REFEREE_DISCOUNT_GROSZE;
  const discountPln = Math.round(refereeDiscountGrosze / 100);
  redirect(`/?ref=${upper}&from=${encodeURIComponent(owner.ownerName || "friend")}&discount=${discountPln}`);
}
