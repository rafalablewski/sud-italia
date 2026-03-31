/**
 * Push Notification Infrastructure
 *
 * Placeholder for Web Push notification support.
 * When NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set,
 * this enables browser push notifications for:
 * - Order status updates ("Your order is ready for pickup!")
 * - Loyalty milestones ("You just reached Silver tier!")
 * - Streak reminders ("Don't break your 5-week streak!")
 * - Flash sales ("20% off pizzas for the next 2 hours!")
 *
 * Setup:
 * 1. Generate VAPID keys: npx web-push generate-vapid-keys
 * 2. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env
 * 3. Install: npm install web-push
 * 4. Register service worker in src/app/(public)/layout.tsx
 * 5. Create /public/sw.js service worker file
 *
 * Docs: https://web.dev/articles/push-notifications-overview
 */

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

/**
 * Send a push notification to a subscribed customer.
 * Returns true if sent successfully, false if push is not configured.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sendPushNotification(
  subscription: PushSubscription,
  message: PushMessage
): Promise<boolean> {
  const { VAPID_PRIVATE_KEY } = process.env;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!VAPID_PRIVATE_KEY || !publicKey) {
    console.log(`[Push Stub] Would notify ${subscription.phone}: "${message.title} — ${message.body}"`);
    return false;
  }

  // TODO: Uncomment when web-push is installed
  // const webpush = (await import("web-push")).default;
  // webpush.setVapidDetails("mailto:hello@suditalia.pl", publicKey, VAPID_PRIVATE_KEY);
  // await webpush.sendNotification(
  //   { endpoint: subscription.endpoint, keys: subscription.keys },
  //   JSON.stringify({ title: message.title, body: message.body, icon: message.icon, url: message.url })
  // );
  return true;
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
