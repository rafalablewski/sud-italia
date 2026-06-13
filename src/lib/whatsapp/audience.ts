import type { CustomerRollup } from "@/lib/store";

/**
 * Broadcast audience filters, computed directly from the customer rollup so
 * they work without the (DB-only) RFM segments table. Opted-out customers and
 * those without a phone are always excluded — a broadcast only ever reaches
 * people who can lawfully be messaged.
 */

export type AudienceKey = "all" | "active" | "lapsed" | "vip" | "new";

export const AUDIENCES: { key: AudienceKey; label: string; hint: string }[] = [
  { key: "all", label: "All customers", hint: "Everyone opted in" },
  { key: "active", label: "Active (60d)", hint: "Ordered in the last 60 days" },
  { key: "lapsed", label: "Lapsed (90d+)", hint: "No order in 90+ days" },
  { key: "vip", label: "VIP", hint: "≥200 zł lifetime & ≥6 orders" },
  { key: "new", label: "New (14d)", hint: "First order in the last 14 days" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Default "VIP" thresholds (≥200 zł lifetime spend AND ≥6 orders). Operators
 *  override via AppSettings.marketing; these are the fallback. */
export const DEFAULT_VIP_SPEND_GROSZE = 20_000;
export const DEFAULT_VIP_ORDERS = 6;

/** Operator-set VIP audience thresholds (passed in by the broadcast route). */
export interface VipThresholds {
  spendGrosze?: number;
  minOrders?: number;
}

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (now - t) / DAY_MS;
}

function matches(c: CustomerRollup, key: AudienceKey, now: number, vip: VipThresholds): boolean {
  switch (key) {
    case "all":
      return true;
    case "active": {
      const d = daysSince(c.lastOrderAt, now);
      return d != null && d <= 60;
    }
    case "lapsed": {
      const d = daysSince(c.lastOrderAt, now);
      return d == null || d > 90;
    }
    case "vip":
      return (
        c.totalSpentGrosze >= (vip.spendGrosze ?? DEFAULT_VIP_SPEND_GROSZE) &&
        c.orderCount >= (vip.minOrders ?? DEFAULT_VIP_ORDERS)
      );
    case "new": {
      const d = daysSince(c.firstOrderAt, now);
      return d != null && d <= 14;
    }
  }
}

/** Eligible (opted-in, has phone) customers matching the audience filter. */
export function selectAudience(
  customers: CustomerRollup[],
  key: AudienceKey,
  now: number = Date.now(),
  vip: VipThresholds = {},
): CustomerRollup[] {
  return customers.filter(
    (c) => !c.smsOptout && !!c.phone && matches(c, key, now, vip),
  );
}

export function isAudienceKey(v: unknown): v is AudienceKey {
  return AUDIENCES.some((a) => a.key === v);
}
