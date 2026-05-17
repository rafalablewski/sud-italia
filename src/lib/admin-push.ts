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

interface AdminPushOptions {
  /** Restrict the fan-out to specific admin user ids. Defaults to all. */
  userIds?: string[];
  /** When set, the fan-out skips this id — used so the actor of an action
   *  doesn't push themselves a notification about their own action. */
  excludeUserId?: string;
  /** Optional dedupe tag — only the latest push with the same tag stays
   *  visible on the user's lock screen. Defaults to event topic if absent. */
  tag?: string;
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
}

async function listAdminSubscriptions(
  opts: AdminPushOptions,
): Promise<AdminPushSubscription[]> {
  const db = getDb();
  if (!db) return [];
  await ensureTable();
  // No subscriptions yet → cheap exit before building a WHERE clause.
  // The query is small (≤ N admins × small number of devices each) so we
  // don't bother with pagination yet.
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
  return rows
    .filter((r) => !opts.excludeUserId || r.user_id !== opts.excludeUserId)
    .map((r) => ({
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
    url: "/admin/slots",
    tag: `admin:slot-pressure:${locationSlug}:${slotTime}`,
  }),
  slotFull: (locationSlug: string, slotTime: string): PushMessage => ({
    title: `Slot ${slotTime} is full`,
    body: `${locationSlug} ${slotTime} just sold out.`,
    url: "/admin/slots",
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
} as const;
