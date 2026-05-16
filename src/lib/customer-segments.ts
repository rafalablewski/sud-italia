import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customerSegments } from "@/db/schema";
import { ensureTable } from "@/db/migrate";
import { logger } from "@/lib/logger";
import { getOrders } from "@/lib/store";
import type { Order } from "@/data/types";

/**
 * Audit §2 "Defensibility — no data moat" + §6 "#10 No cohort-driven
 * personalization". This module is the data moat: every customer gets
 * a deterministic RFM-style segment + a 12-month CLTV prediction. The
 * upsell engine and comms dispatcher both read from this table to
 * personalize without re-deriving signals on every request.
 *
 * Segments:
 *   - `new`        first paid order < 14 days ago, no second order yet
 *   - `occasional` 1 order, > 14 days ago, no second
 *   - `regular`    ≥ 2 orders, ≥ 1 in last 60 days, < 6 in last 90 days
 *   - `champion`   ≥ 6 orders in last 90 days, last order ≤ 30 days ago
 *   - `vip`        lifetime spend ≥ 200 PLN AND ≥ 6 orders ever
 *   - `lapsed`     last order > 90 days ago
 *
 * VIP wins over champion when both apply. The order matters: champion
 * is short-term-hot, VIP is durably valuable.
 */

export const SEGMENTS = [
  "new",
  "occasional",
  "regular",
  "champion",
  "vip",
  "lapsed",
] as const;
export type CustomerSegment = (typeof SEGMENTS)[number];

export interface CustomerSegmentScore {
  phone: string;
  segment: CustomerSegment;
  rfmScore: number;
  recencyDays: number;
  frequency: number;
  monetaryGrosze: number;
  lifetimeValueGrosze: number;
  /**
   * Naive 12-month forward CLTV: trailing 90-day spend × 4 with a recency
   * decay (the lapsed bucket gets 25 %, occasional 50 %, everyone else
   * 100 %). Replace with a real model once there's a 12-month-of-orders
   * baseline to fit against.
   */
  predictedCltvGrosze: number;
  factors: Record<string, number | string>;
}

const SEGMENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS customer_segments (
    phone text PRIMARY KEY,
    segment text NOT NULL,
    rfm_score integer NOT NULL,
    recency_days integer NOT NULL,
    frequency integer NOT NULL,
    monetary_grosze integer NOT NULL,
    lifetime_value_grosze integer NOT NULL,
    predicted_cltv_grosze integer NOT NULL,
    factors jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS customer_segments_segment_idx
    ON customer_segments (segment)`,
  `CREATE INDEX IF NOT EXISTS customer_segments_computed_at_idx
    ON customer_segments (computed_at)`,
];

async function ensureSegmentsTable(): Promise<void> {
  await ensureTable("customer_segments", SEGMENTS_DDL);
}

function dayDiff(fromIso: string, toIso: string): number {
  return Math.max(
    0,
    Math.floor(
      (new Date(toIso).getTime() - new Date(fromIso).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
}

export function scoreCustomer(
  customerOrders: Order[],
  now: Date = new Date(),
): CustomerSegmentScore | null {
  const paid = customerOrders.filter(
    (o) => o.status !== "pending" && o.status !== "cancelled" && o.customerPhone,
  );
  if (paid.length === 0) return null;

  const phone = paid[0].customerPhone;
  paid.sort((a, b) =>
    (a.paidAt || a.createdAt).localeCompare(b.paidAt || b.createdAt),
  );

  const last = paid[paid.length - 1];
  const lastAt = last.paidAt || last.createdAt;
  const recencyDays = dayDiff(lastAt, now.toISOString());

  const frequency = paid.length;
  const monetaryGrosze = paid.reduce((s, o) => s + o.totalAmount, 0);
  const lifetimeValueGrosze = monetaryGrosze;

  const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const since60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const orders90 = paid.filter((o) => (o.paidAt || o.createdAt) >= since90);
  const orders60 = paid.filter((o) => (o.paidAt || o.createdAt) >= since60);

  // Classic RFM: bucket each axis 1-10, weighted sum.
  const recencyScore =
    recencyDays <= 7
      ? 10
      : recencyDays <= 14
        ? 9
        : recencyDays <= 30
          ? 8
          : recencyDays <= 60
            ? 6
            : recencyDays <= 90
              ? 4
              : recencyDays <= 180
                ? 2
                : 1;
  const frequencyScore = Math.min(10, Math.ceil(Math.log2(frequency + 1) * 3));
  const monetaryScore = Math.min(
    10,
    Math.ceil(Math.log2(monetaryGrosze / 100 + 1) * 1.8),
  );
  const rfmScore =
    recencyScore * 30 + frequencyScore * 35 + monetaryScore * 35;

  let segment: CustomerSegment;
  const firstAt = paid[0].paidAt || paid[0].createdAt;
  const isVip = frequency >= 6 && monetaryGrosze >= 20000;
  const isChampion = orders90.length >= 6 && recencyDays <= 30;
  if (recencyDays > 90) {
    segment = "lapsed";
  } else if (isVip) {
    segment = "vip";
  } else if (isChampion) {
    segment = "champion";
  } else if (frequency >= 2 && orders60.length >= 1) {
    segment = "regular";
  } else if (firstAt >= since14 && frequency === 1) {
    segment = "new";
  } else {
    segment = "occasional";
  }

  const recencyDecay =
    segment === "lapsed" ? 0.25 : segment === "occasional" ? 0.5 : 1;
  const last90Revenue = orders90.reduce((s, o) => s + o.totalAmount, 0);
  const predictedCltvGrosze = Math.round(last90Revenue * 4 * recencyDecay);

  return {
    phone,
    segment,
    rfmScore,
    recencyDays,
    frequency,
    monetaryGrosze,
    lifetimeValueGrosze,
    predictedCltvGrosze,
    factors: {
      recencyScore,
      frequencyScore,
      monetaryScore,
      orders90: orders90.length,
      orders60: orders60.length,
      firstOrderAt: firstAt,
      lastOrderAt: lastAt,
    },
  };
}

/**
 * Rebuilds the customer_segments table from the full orders history. Called
 * by the weekly cron and surfaceable from /admin/customers as a "rescan"
 * button.
 *
 * One pass over orders → bucket by phone → score → upsert. Single
 * transaction would be nicer but the Neon HTTP driver doesn't expose one
 * across multiple statements; the cron's per-row upserts are idempotent
 * so an aborted run leaves the table in a still-correct (just stale)
 * state.
 */
export async function rebuildAllCustomerSegments(
  now: Date = new Date(),
): Promise<{ scored: number; segmentCounts: Record<CustomerSegment, number> }> {
  const db = getDb();
  if (!db) {
    return {
      scored: 0,
      segmentCounts: { new: 0, occasional: 0, regular: 0, champion: 0, vip: 0, lapsed: 0 },
    };
  }
  await ensureSegmentsTable();

  const orders = await getOrders();
  const byPhone = new Map<string, Order[]>();
  for (const o of orders) {
    if (!o.customerPhone) continue;
    const arr = byPhone.get(o.customerPhone) ?? [];
    arr.push(o);
    byPhone.set(o.customerPhone, arr);
  }

  const counts: Record<CustomerSegment, number> = {
    new: 0,
    occasional: 0,
    regular: 0,
    champion: 0,
    vip: 0,
    lapsed: 0,
  };
  let scored = 0;

  for (const [, list] of byPhone) {
    const score = scoreCustomer(list, now);
    if (!score) continue;
    try {
      const values = {
        phone: score.phone,
        segment: score.segment,
        rfmScore: score.rfmScore,
        recencyDays: score.recencyDays,
        frequency: score.frequency,
        monetaryGrosze: score.monetaryGrosze,
        lifetimeValueGrosze: score.lifetimeValueGrosze,
        predictedCltvGrosze: score.predictedCltvGrosze,
        factors: score.factors,
        computedAt: now,
      };
      await db
        .insert(customerSegments)
        .values(values)
        .onConflictDoUpdate({
          target: customerSegments.phone,
          set: values,
        });
      counts[score.segment]++;
      scored++;
    } catch (err) {
      logger.warn(
        "rebuildAllCustomerSegments upsert failed",
        { phone: score.phone, layer: "customer-segments" },
        err,
      );
    }
  }

  return { scored, segmentCounts: counts };
}

export async function getCustomerSegment(
  phone: string,
): Promise<CustomerSegmentScore | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureSegmentsTable();
    const rows = await db
      .select()
      .from(customerSegments)
      .where(eq(customerSegments.phone, phone))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      phone: r.phone,
      segment: r.segment as CustomerSegment,
      rfmScore: r.rfmScore,
      recencyDays: r.recencyDays,
      frequency: r.frequency,
      monetaryGrosze: r.monetaryGrosze,
      lifetimeValueGrosze: r.lifetimeValueGrosze,
      predictedCltvGrosze: r.predictedCltvGrosze,
      factors: (r.factors ?? {}) as Record<string, number | string>,
    };
  } catch (err) {
    logger.warn(
      "getCustomerSegment read failed",
      { phone, layer: "customer-segments" },
      err,
    );
    return null;
  }
}

export async function getSegmentCounts(): Promise<Record<CustomerSegment, number>> {
  const db = getDb();
  const empty: Record<CustomerSegment, number> = {
    new: 0,
    occasional: 0,
    regular: 0,
    champion: 0,
    vip: 0,
    lapsed: 0,
  };
  if (!db) return empty;
  try {
    await ensureSegmentsTable();
    const rows = await db.select().from(customerSegments);
    for (const r of rows) {
      const seg = r.segment as CustomerSegment;
      if (seg in empty) empty[seg]++;
    }
    return empty;
  } catch (err) {
    logger.warn(
      "getSegmentCounts read failed",
      { layer: "customer-segments" },
      err,
    );
    return empty;
  }
}
