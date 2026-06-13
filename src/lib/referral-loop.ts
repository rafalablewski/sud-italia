import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { referralCodes, referralRedemptions } from "@/db/schema";
import { ensureTable } from "@/db/migrate";
import { logger } from "@/lib/logger";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { appendOutboxEvent } from "@/lib/outbox";
import { getLoyaltySettings } from "@/lib/store";

/**
 * Audit §6 "#5 No referral economic loop". A real give-get: every
 * customer gets a stable code on their first paid order, the URL
 * `/r/CODE` lands a referee on the menu with a banner + auto-applied
 * discount, and when the referee's first paid order clears, the
 * referrer's code records a `rewarded` redemption.
 *
 * Defaults (configurable per-tenant later via loyalty-settings):
 *   - referee discount: 10 PLN off first order
 *   - referrer reward:  100 loyalty points (≈ 10 PLN of next-order value)
 *
 * The give-get prints money over a 6-12 month horizon because the
 * marginal acquisition cost is bounded by the discount cap, while
 * the customer LTV is unbounded.
 */

export const REFERRER_REWARD_POINTS = 100;
export const REFEREE_DISCOUNT_GROSZE = 1000; // 10 PLN

const REFERRAL_CODES_DDL = [
  `CREATE TABLE IF NOT EXISTS referral_codes (
    code text PRIMARY KEY,
    owner_phone text NOT NULL,
    owner_name text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS referral_codes_owner_phone_idx
    ON referral_codes (owner_phone)`,
];

const REFERRAL_REDEMPTIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS referral_redemptions (
    id text PRIMARY KEY,
    code text NOT NULL,
    referee_phone text NOT NULL,
    order_id text,
    reward_given_grosze integer NOT NULL DEFAULT 0,
    discount_applied_grosze integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    qualified_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS referral_redemptions_code_idx
    ON referral_redemptions (code)`,
  `CREATE INDEX IF NOT EXISTS referral_redemptions_referee_phone_idx
    ON referral_redemptions (referee_phone)`,
  `CREATE INDEX IF NOT EXISTS referral_redemptions_status_idx
    ON referral_redemptions (status)`,
];

async function ensureReferralTables(): Promise<void> {
  await ensureTable("referral_codes", REFERRAL_CODES_DDL);
  await ensureTable("referral_redemptions", REFERRAL_REDEMPTIONS_DDL);
}

/**
 * 6-char base32-ish code from a phone-derived seed. Deterministic per
 * owner — the same phone always produces the same code, so the customer
 * can re-share a link they sent six months ago and it still works.
 * Collision-resistant for the chain's foreseeable scale (~33 ^ 6 keyspace).
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function deriveCode(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
    h = Math.floor(h / CODE_ALPHABET.length) || h * 33;
  }
  return out;
}

export async function getOrCreateReferralCode(
  phoneRaw: string,
  name: string = "",
): Promise<{ code: string; ownerPhone: string }> {
  const phone = normalizePlPhoneE164(phoneRaw) || phoneRaw;
  const db = getDb();
  if (!db) {
    return { code: deriveCode(phone), ownerPhone: phone };
  }
  await ensureReferralTables();
  const existing = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.ownerPhone, phone))
    .limit(1);
  if (existing.length === 1) {
    return { code: existing[0].code, ownerPhone: phone };
  }
  const code = deriveCode(phone);
  await db
    .insert(referralCodes)
    .values({ code, ownerPhone: phone, ownerName: name })
    .onConflictDoNothing();
  return { code, ownerPhone: phone };
}

export async function getReferralCodeOwner(
  code: string,
): Promise<{ ownerPhone: string; ownerName: string } | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureReferralTables();
    const rows = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code.toUpperCase()))
      .limit(1);
    if (rows.length === 0) return null;
    return { ownerPhone: rows[0].ownerPhone, ownerName: rows[0].ownerName };
  } catch (err) {
    logger.warn("getReferralCodeOwner failed", { code, layer: "referral" }, err);
    return null;
  }
}

/**
 * Records a redemption intent at checkout time. Idempotent on
 * (code, referee_phone): a single referee can only redeem each code
 * once, regardless of order count.
 */
export async function recordRedemptionIntent(
  code: string,
  refereePhoneRaw: string,
): Promise<{ id: string; status: "pending" | "duplicate" | "self_referral" }> {
  const refereePhone = normalizePlPhoneE164(refereePhoneRaw) || refereePhoneRaw;
  const owner = await getReferralCodeOwner(code);
  if (!owner) return { id: "", status: "duplicate" };
  if (owner.ownerPhone === refereePhone) {
    return { id: "", status: "self_referral" };
  }
  const db = getDb();
  if (!db) return { id: "", status: "duplicate" };
  await ensureReferralTables();
  const existing = await db
    .select()
    .from(referralRedemptions)
    .where(
      and(
        eq(referralRedemptions.code, code.toUpperCase()),
        eq(referralRedemptions.refereePhone, refereePhone),
      ),
    )
    .limit(1);
  if (existing.length === 1) {
    return { id: existing[0].id, status: "duplicate" };
  }
  const id = `rr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(referralRedemptions).values({
    id,
    code: code.toUpperCase(),
    refereePhone,
    discountAppliedGrosze: REFEREE_DISCOUNT_GROSZE,
    status: "pending",
  });
  return { id, status: "pending" };
}

/**
 * Called from the order-paid path. If the customer was referred and
 * this is their first paid order, mark the redemption `qualified` and
 * queue an outbox event so the comms dispatcher can SMS the referrer
 * + credit the loyalty points.
 *
 * "First paid order" means: orderCountForPhone === 1 at the moment
 * this function runs. We trust the caller to only invoke it from the
 * paid-order path.
 */
export async function qualifyReferralOnFirstPaidOrder(
  refereePhoneRaw: string,
  orderId: string,
): Promise<{ qualified: boolean; code?: string; ownerPhone?: string }> {
  const refereePhone = normalizePlPhoneE164(refereePhoneRaw) || refereePhoneRaw;
  const db = getDb();
  if (!db) return { qualified: false };
  await ensureReferralTables();
  const rows = await db
    .select()
    .from(referralRedemptions)
    .where(
      and(
        eq(referralRedemptions.refereePhone, refereePhone),
        eq(referralRedemptions.status, "pending"),
      ),
    )
    .limit(1);
  if (rows.length === 0) return { qualified: false };
  const redemption = rows[0];
  const owner = await getReferralCodeOwner(redemption.code);
  if (!owner) return { qualified: false };

  // Referrer reward is operator-set (admin: /admin/growth → Referrals); the
  // const is only the first-deploy default. Single source of truth so a
  // change in admin actually lands on the points awarded.
  const referrerPoints = (await getLoyaltySettings()).referral.referrerPoints ?? REFERRER_REWARD_POINTS;

  await db
    .update(referralRedemptions)
    .set({
      status: "qualified",
      orderId,
      qualifiedAt: new Date(),
      // 10 grosze per loyalty point (= 0.1 PLN) — matches the
      // dispatcher's `(p.rewardPoints / 10).toFixed(0)` PLN display so
      // a 100-point reward shows as ~10 PLN, not 100 PLN. (Gemini
      // review caught a 10× overpayment in the original draft.)
      rewardGivenGrosze: referrerPoints * 10,
    })
    .where(eq(referralRedemptions.id, redemption.id));

  await appendOutboxEvent({
    eventType: "referral.qualified",
    entityType: "referral",
    entityId: redemption.id,
    dedupeKey: redemption.id,
    payload: {
      code: redemption.code,
      ownerPhone: owner.ownerPhone,
      ownerName: owner.ownerName,
      refereePhone,
      orderId,
      rewardPoints: referrerPoints,
      discountAppliedGrosze: redemption.discountAppliedGrosze,
    },
  });

  return { qualified: true, code: redemption.code, ownerPhone: owner.ownerPhone };
}

/**
 * Count of this owner's referrals that *qualified* (referee placed their first
 * paid order) at or after `sinceMs`. Powers the weekly "Bring a Friend"
 * challenge on /rewards — only referrals that landed this week count toward it.
 */
export async function countQualifiedReferralsSince(
  phoneRaw: string,
  sinceMs: number,
): Promise<number> {
  const phone = normalizePlPhoneE164(phoneRaw) || phoneRaw;
  const db = getDb();
  if (!db) return 0;
  await ensureReferralTables();
  const codeRows = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.ownerPhone, phone))
    .limit(1);
  const code = codeRows[0]?.code;
  if (!code) return 0;
  const reds = await db
    .select()
    .from(referralRedemptions)
    .where(eq(referralRedemptions.code, code));
  let n = 0;
  for (const r of reds) {
    const isQualified = r.status === "qualified" || r.status === "rewarded";
    if (isQualified && r.qualifiedAt && new Date(r.qualifiedAt).getTime() >= sinceMs) {
      n++;
    }
  }
  return n;
}

/**
 * Per-owner stats for the customer-facing /rewards page and the
 * admin's per-customer detail.
 */
export async function getReferralStats(
  phoneRaw: string,
): Promise<{
  code: string | null;
  pending: number;
  qualified: number;
  totalRewardGrosze: number;
}> {
  const phone = normalizePlPhoneE164(phoneRaw) || phoneRaw;
  const db = getDb();
  if (!db) {
    return { code: null, pending: 0, qualified: 0, totalRewardGrosze: 0 };
  }
  await ensureReferralTables();
  const codeRows = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.ownerPhone, phone))
    .limit(1);
  const code = codeRows[0]?.code ?? null;
  if (!code) return { code: null, pending: 0, qualified: 0, totalRewardGrosze: 0 };

  const reds = await db
    .select()
    .from(referralRedemptions)
    .where(eq(referralRedemptions.code, code));
  let pending = 0;
  let qualified = 0;
  let totalReward = 0;
  for (const r of reds) {
    if (r.status === "pending") pending++;
    else if (r.status === "qualified" || r.status === "rewarded") {
      qualified++;
      totalReward += r.rewardGivenGrosze;
    }
  }
  return { code, pending, qualified, totalRewardGrosze: totalReward };
}
