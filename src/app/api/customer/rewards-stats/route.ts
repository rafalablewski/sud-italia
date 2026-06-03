import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getOrdersByPhone, getLoyaltyMember } from "@/lib/store";
import {
  getOrCreateReferralCode,
  countQualifiedReferralsSince,
} from "@/lib/referral-loop";
import {
  computeWeekStreak,
  computeChallengeProgress,
  challengeProgressMap,
  weekStart,
} from "@/lib/rewards-progress";

export const dynamic = "force-dynamic";

/**
 * Real data behind the /rewards engagement surfaces (CLAUDE.md Rule #1):
 *   - `referralCode`     — the persisted, deterministic-per-phone code from
 *                          referral-loop.ts (NOT a per-render Math.random()).
 *   - `weekStreak`       — consecutive-week order streak from real orders.
 *   - `challengeProgress`— this-week progress per active challenge id.
 *
 * Phone is read from the `sud-italia-customer` cookie (same pattern as
 * /api/customer/profile) so a caller can only see their own stats.
 */
export async function GET() {
  const cookieStore = await cookies();
  const phoneCookie = cookieStore.get("sud-italia-customer");
  if (!phoneCookie?.value) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const raw = decodeURIComponent(phoneCookie.value);
  const phone = normalizePlPhoneE164(raw) ?? raw.trim();

  const member = await getLoyaltyMember(phone);
  const { code } = await getOrCreateReferralCode(phone, member?.name ?? "");

  const now = new Date();
  const weekStartMs = weekStart(now).getTime();

  // Indexed by-phone read (DB filters phone + excludes pending/simulated) so
  // this scales with one customer's order count, not the whole order book.
  // Drop cancelled too — neither should count toward streaks or challenges.
  const mine = (await getOrdersByPhone(phone)).filter((o) => o.status !== "cancelled");

  const weekStreak = computeWeekStreak(
    mine.map((o) => o.createdAt),
    now,
  );

  const qualifiedThisWeek = await countQualifiedReferralsSince(phone, weekStartMs);
  const progress = computeChallengeProgress(mine, qualifiedThisWeek, now);

  return NextResponse.json({
    referralCode: code,
    weekStreak,
    challengeProgress: challengeProgressMap(progress),
  });
}
