/**
 * Browser-side helpers for Web Push subscription. The customer flow:
 *
 *   1. Confirmation page mounts <PushOptInButton/>
 *   2. Customer taps "Notify me when ready"
 *   3. Browser shows the permission prompt
 *   4. We call PushManager.subscribe() with the VAPID public key
 *   5. POST the subscription to /api/push/subscribe (cookie identifies
 *      the phone)
 *
 * Doing this here — on the confirmation page, post-checkout, with
 * stated intent — is the highest-acceptance moment. Browsers penalise
 * sites that prompt on landing.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushOptInResult =
  | "subscribed"
  | "already-subscribed"
  | "denied"
  | "unsupported"
  | "no-key"
  | "error";

export async function ensurePushSubscription(
  vapidPublicKey: string | undefined,
  phone?: string,
): Promise<PushOptInResult> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (!vapidPublicKey) return "no-key";

  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    let alreadySubscribed = false;
    if (sub) {
      alreadySubscribed = true;
    } else {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const raw = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return "error";

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: raw.endpoint,
        keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
        phone,
      }),
    });
    if (!res.ok) return "error";
    return alreadySubscribed ? "already-subscribed" : "subscribed";
  } catch {
    return "error";
  }
}
