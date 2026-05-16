/**
 * Web Push notifications (audit §3 — turns the "templates exist" stub
 * into a working channel). Wired through the comms dispatcher so
 * `order.ready` outbox events fan out to every device the customer
 * has subscribed.
 *
 * Setup:
 *   1. Generate VAPID keys: `npx web-push generate-vapid-keys`
 *   2. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
 *   3. Redeploy — the SW already ships in /public/sw.js
 *
 * When the keys are absent the call path stays safe (logs + returns
 * false) so dev environments don't crash.
 *
 * Docs: https://web.dev/articles/push-notifications-overview
 */

import { logger } from "@/lib/logger";

export interface PushSubscription {
  phone: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushMessage {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
}

let vapidConfigured = false;

async function configureVapid(): Promise<typeof import("web-push") | null> {
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!privateKey || !publicKey) return null;
  const webpush = (await import("web-push")).default;
  if (!vapidConfigured) {
    const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:hello@suditalia.pl";
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return webpush;
}

/**
 * Send a push notification to a subscribed customer. Returns true if
 * the payload was handed to the push service. A 404/410 from the push
 * service means the subscription is gone — the caller should drop it
 * (sendPushNotification surfaces a typed `subscriptionGone` outcome
 * for that case so the fanout can clean up).
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  message: PushMessage,
): Promise<{ ok: boolean; subscriptionGone?: boolean }> {
  const webpush = await configureVapid();
  if (!webpush) {
    logger.debug("push.stub.no_vapid", {
      layer: "push",
      phone: subscription.phone,
      title: message.title,
    });
    return { ok: false };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      JSON.stringify({
        title: message.title,
        body: message.body,
        icon: message.icon,
        url: message.url,
        tag: message.tag,
      }),
    );
    return { ok: true };
  } catch (err) {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : 0;
    if (statusCode === 404 || statusCode === 410) {
      logger.info("push.subscription_gone", {
        layer: "push",
        endpoint: subscription.endpoint.slice(0, 80),
        statusCode,
      });
      return { ok: false, subscriptionGone: true };
    }
    logger.warn(
      "push.send_failed",
      {
        layer: "push",
        phone: subscription.phone,
        endpoint: subscription.endpoint.slice(0, 80),
        statusCode,
      },
      err,
    );
    return { ok: false };
  }
}

/**
 * Fan-out helper. Loads every subscription for the given phone from
 * kv_store and pushes the message to each device. Stub mode (no VAPID
 * keys) logs but doesn't throw — keeps the call path safe to wire
 * into the order outbox without gating on production credentials.
 *
 * Subscriptions that the push service reports as gone (404/410) are
 * removed so they don't get retried.
 */
export async function pushToCustomer(phone: string, message: PushMessage): Promise<number> {
  const { listPushSubscriptions, deletePushSubscription } = await import("@/lib/store");
  const subs = await listPushSubscriptions(phone);
  if (subs.length === 0) return 0;
  let sent = 0;
  for (const sub of subs) {
    const res = await sendPushNotification(
      { phone: sub.phone, endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      message,
    );
    if (res.ok) sent += 1;
    if (res.subscriptionGone) {
      await deletePushSubscription(sub.endpoint).catch(() => {});
    }
  }
  return sent;
}

/**
 * Pre-defined notification templates.
 */
export const PUSH_TEMPLATES = {
  orderReady: (orderId: string): PushMessage => ({
    title: "Your order is ready! 🍕",
    body: "Head to the truck to pick up your order.",
    url: `/order-confirmation?orderId=${orderId}`,
    tag: "order-ready",
  }),
  tierUpgrade: (tierName: string): PushMessage => ({
    title: `You reached ${tierName} tier!`,
    body: "Check your new perks and multiplier bonus.",
    url: "/rewards",
    tag: "tier-upgrade",
  }),
  streakReminder: (weeks: number): PushMessage => ({
    title: `${weeks}-week streak at risk!`,
    body: "Order today to keep your streak alive.",
    url: "/",
    tag: "streak-reminder",
  }),
  flashSale: (description: string): PushMessage => ({
    title: "Flash deal! ⚡",
    body: description,
    url: "/",
    tag: "flash-sale",
  }),
} as const;
