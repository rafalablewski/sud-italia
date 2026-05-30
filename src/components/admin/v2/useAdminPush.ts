"use client";

import { useCallback, useEffect, useState } from "react";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

interface PushApi {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  busy: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

/**
 * Capability-gated push subscription helper for admin push. Uses the
 * existing /api/admin/push/subscribe contract — POST endpoint + keys to
 * subscribe, DELETE the endpoint to unsubscribe. Reports `configured`
 * false when NEXT_PUBLIC_VAPID_PUBLIC_KEY is unset so the UI can render
 * a "configure VAPID first" hint instead of pretending it works.
 */
export function useAdminPush(): PushApi {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setSubscribed(!!s))
      .catch(() => {});
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !VAPID_KEY) return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;
      const reg = await navigator.serviceWorker.ready;
      // Cast to BufferSource — the DOM lib's PushManager type narrows the
      // Uint8Array buffer to a strict ArrayBuffer, but the runtime accepts
      // the broader Uint8Array we return from urlBase64ToUint8Array.
      const key = urlBase64ToUint8Array(VAPID_KEY) as unknown as BufferSource;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const payload = sub.toJSON();
      const r = await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: payload.endpoint,
          keys: payload.keys,
        }),
      });
      if (!r.ok) {
        await sub.unsubscribe();
        return false;
      }
      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/admin/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return {
    supported,
    configured: VAPID_KEY.length > 0,
    permission,
    subscribed,
    busy,
    subscribe,
    unsubscribe,
  };
}
