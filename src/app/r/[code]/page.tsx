import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getReferralCodeOwner, REFEREE_DISCOUNT_GROSZE } from "@/lib/referral-loop";

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
  const discountPln = Math.round(REFEREE_DISCOUNT_GROSZE / 100);
  redirect(`/?ref=${upper}&from=${encodeURIComponent(owner.ownerName || "friend")}&discount=${discountPln}`);
}
