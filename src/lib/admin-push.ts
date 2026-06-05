/**
 * Admin-facing push notifications. Mirror of `push-notifications.ts` but
 * the subscription set comes from `admin_push_subscriptions` (per-admin)
 * instead of `push_subscriptions` (per-customer-phone).
 *
 * Used by operational hooks — order-placed, slot-pressure, cash-variance,
 * dispute-opened, low-stock — to wake an owner's phone when something
 * needs a human while they're away from the desktop.
 *
 * VAPID setup is shared with the customer path. When the keys are absent
 * the call path stays safe (logs + returns 0) so dev environments don't
 * crash. Subscriptions the push service reports as gone (404/410) are
 * pruned eagerly so we don't keep retrying dead endpoints.
 *
 * Per-user category opt-in lives in `admin_push_prefs` — operators can
 * mute specific categories (e.g. "no new_order pings, but yes refunds")
 * without unsubscribing entirely.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { logger } from "@/lib/logger";
import {
  sendPushNotification,
  type PushMessage,
} from "@/lib/push-notifications";

interface AdminPushSubscription {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type AdminPushCategory =
  | "new_order"
  | "slot_full"
  | "low_slots"
  | "order_status"
  | "bundle_low_margin"
  | "dispute"
  | "low_stock"
  | "cash_variance"
  | "refund"
  | "test";

const DEFAULT_CATEGORY_PREFS: Record<AdminPushCategory, boolean> = {
  new_order: true,
  slot_full: true,
  low_slots: true,
  order_status: false, // chatty — opt-in only
  bundle_low_margin: true,
  dispute: true,
  low_stock: true,
  cash_variance: true,
  refund: true,
  test: true,
};

interface AdminPushOptions {
  /** Restrict the fan-out to specific admin user ids. Defaults to all. */
  userIds?: string[];
  /** When set, the fan-out skips this id — used so the actor of an action
   *  doesn't push themselves a notification about their own action. */
  excludeUserId?: string;
  /** Category the push falls under — used to filter against each user's
   *  per-category opt-in preferences. */
  category?: AdminPushCategory;
  /** When set, only push when |varianceGrosze| is at least this much. */
  varianceGrosze?: number;
}

async function ensureTable(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
      user_id text NOT NULL,
      endpoint text PRIMARY KEY,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_push_prefs (
      user_id text PRIMARY KEY,
      muted_categories text[] NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getMutedCategories(): Promise<Map<string, Set<string>>> {
  const db = getDb();
  if (!db) return new Map();
  const rows = (await db.execute(sql`
    SELECT user_id, muted_categories FROM admin_push_prefs
  `)) as unknown as { user_id: string; muted_categories: string[] }[];
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    out.set(r.user_id, new Set(r.muted_categories ?? []));
  }
  return out;
}

export async function getAdminPushPrefs(
  userId: string,
): Promise<{ muted: AdminPushCategory[] }> {
  const db = getDb();
  if (!db) return { muted: [] };
  await ensureTable();
  const rows = (await db.execute(sql`
    SELECT muted_categories FROM admin_push_prefs WHERE user_id = ${userId}
  `)) as unknown as { muted_categories: string[] }[];
  const muted = (rows[0]?.muted_categories ?? []) as AdminPushCategory[];
  return { muted };
}

export async function setAdminPushPrefs(
  userId: string,
  muted: AdminPushCategory[],
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await ensureTable();
  await db.execute(sql`
    INSERT INTO admin_push_prefs (user_id, muted_categories, updated_at)
    VALUES (${userId}, ${muted}::text[], now())
    ON CONFLICT (user_id) DO UPDATE
    SET muted_categories = EXCLUDED.muted_categories, updated_at = now()
  `);
}

/** Server-side toggle for whether *any* admin should be paged for a
 *  category. Right now it's the static default table; future revisions
 *  can read from settings. Exported so the notification fanout can early-
 *  exit before pulling subscriptions. */
export function adminPushCategoryEnabled(category: string): boolean {
  const known = (DEFAULT_CATEGORY_PREFS as Record<string, boolean>)[category];
  return known !== false; // unknown categories default to enabled
}

async function listAdminSubscriptions(
  opts: AdminPushOptions,
): Promise<AdminPushSubscription[]> {
  const db = getDb();
  if (!db) return [];
  await ensureTable();
  const include = opts.userIds && opts.userIds.length > 0 ? opts.userIds : null;
  let rows: { user_id: string; endpoint: string; p256dh: string; auth: string }[];
  if (include) {
    rows = (await db.execute(sql`
      SELECT user_id, endpoint, p256dh, auth
      FROM admin_push_subscriptions
      WHERE user_id = ANY(${include})
    `)) as unknown as typeof rows;
  } else {
    rows = (await db.execute(sql`
      SELECT user_id, endpoint, p256dh, auth FROM admin_push_subscriptions
    `)) as unknown as typeof rows;
  }
  let filtered = rows.filter(
    (r) => !opts.excludeUserId || r.user_id !== opts.excludeUserId,
  );
  // Per-user category mute. `test` pushes always go through — they're
  // explicit user actions.
  if (opts.category && opts.category !== "test") {
    const muted = await getMutedCategories();
    filtered = filtered.filter((r) => !muted.get(r.user_id)?.has(opts.category!));
  }
  return filtered.map((r) => ({
    userId: r.user_id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
  }));
}

async function dropDeadEndpoint(endpoint: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      DELETE FROM admin_push_subscriptions WHERE endpoint = ${endpoint}
    `);
  } catch (err) {
    logger.warn("admin.push.prune_failed", { layer: "admin-push" }, err);
  }
}

/**
 * Send a push to every admin subscription matching `opts`. Returns the
 * count of devices that accepted the push. Stub-safe when VAPID is not
 * configured.
 */
export async function pushToAdmins(
  message: PushMessage,
  opts: AdminPushOptions = {},
): Promise<number> {
  const subs = await listAdminSubscriptions(opts);
  if (subs.length === 0) return 0;
  let sent = 0;
  for (const sub of subs) {
    const res = await sendPushNotification(
      // Reuse the customer signature — `phone` is just a log key, we pass
      // the admin id so log lines correlate to the right operator.
      {
        phone: `admin:${sub.userId}`,
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      message,
    );
    if (res.ok) sent += 1;
    if (res.subscriptionGone) {
      await dropDeadEndpoint(sub.endpoint);
    }
  }
  if (sent > 0) {
    logger.info("admin.push.sent", {
      layer: "admin-push",
      tag: message.tag,
      category: opts.category,
      sent,
      subs: subs.length,
    });
  }
  return sent;
}

// --- Pre-defined operational templates --------------------------------

export const ADMIN_PUSH_TEMPLATES = {
  newOrder: (orderId: string, customerName: string, totalZl: string): PushMessage => ({
    title: `New order · ${totalZl}`,
    body: `${customerName} just placed order #${orderId.slice(-6)}.`,
    url: `/admin/orders#${orderId}`,
    tag: "admin:new-order",
  }),
  slotPressure: (locationSlug: string, slotTime: string): PushMessage => ({
    title: `Slot ${slotTime} is filling`,
    body: `${locationSlug} ${slotTime} only has 1 spot left.`,
    url: "/core/service/slots",
    tag: `admin:slot-pressure:${locationSlug}:${slotTime}`,
  }),
  slotFull: (locationSlug: string, slotTime: string): PushMessage => ({
    title: `Slot ${slotTime} is full`,
    body: `${locationSlug} ${slotTime} just sold out.`,
    url: "/core/service/slots",
    tag: `admin:slot-full:${locationSlug}:${slotTime}`,
  }),
  cashVariance: (locationSlug: string, varianceZl: string): PushMessage => ({
    title: `Cash variance · ${varianceZl}`,
    body: `Close-out at ${locationSlug} ended outside tolerance.`,
    url: "/admin/cash",
    tag: `admin:cash-variance:${locationSlug}`,
  }),
  refundProcessed: (orderId: string, amountZl: string, actor: string): PushMessage => ({
    title: `Refund · ${amountZl}`,
    body: `${actor} refunded order #${orderId.slice(-6)}.`,
    url: `/admin/orders#${orderId}`,
    tag: `admin:refund:${orderId}`,
  }),
  disputeOpened: (orderId: string, totalZl: string): PushMessage => ({
    title: `Dispute opened · ${totalZl}`,
    body: `Stripe flagged order #${orderId.slice(-6)} as disputed.`,
    url: `/admin/orders#${orderId}`,
    tag: `admin:dispute:${orderId}`,
  }),
  lowStock: (locationSlug: string, count: number): PushMessage => ({
    title: count === 1 ? "1 ingredient low" : `${count} ingredients low`,
    body: `${locationSlug} is below reorder point on ${count === 1 ? "one item" : `${count} items`}.`,
    url: "/admin/inventory",
    tag: `admin:low-stock:${locationSlug}`,
  }),
  test: (actor: string): PushMessage => ({
    title: "Test push 🔔",
    body: `Sent from your account (${actor}).`,
    url: "/admin",
    tag: "admin:test",
  }),
} as const;
