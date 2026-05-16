"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle } from "lucide-react";
import { ensurePushSubscription, type PushOptInResult } from "@/lib/push-client";

/**
 * Order-confirmation opt-in for web push (audit §3). We surface this
 * only after a successful order — that's the moment customers most
 * want "ping me when it's ready" and browsers reward the high-intent
 * timing with high acceptance rates.
 *
 * The button quietly hides when:
 *   - the browser doesn't support push (older Safari, embedded webviews)
 *   - VAPID isn't configured server-side
 *   - the customer has already subscribed on this device
 */
export function PushOptInButton({ phone }: { phone?: string }) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  // Lazy initial state runs once on mount and computes the synchronous
  // browser-capability + permission check before the first render —
  // keeps the useEffect for async work (PushManager.getSubscription)
  // only.
  const [status, setStatus] = useState<"idle" | "loading" | PushOptInResult>(
    () => {
      if (typeof window === "undefined") return "idle";
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return "unsupported";
      }
      if (Notification.permission === "denied") return "denied";
      return "idle";
    },
  );

  useEffect(() => {
    if (status !== "idle") return;
    // Detect already-subscribed silently so the CTA disappears on
    // repeat visits without ever surfacing the permission prompt.
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setStatus("already-subscribed");
      })
      .catch(() => {});
  }, [status]);

  if (!vapidKey) return null;
  if (status === "unsupported") return null;
  if (status === "denied") return null;
  if (status === "already-subscribed" || status === "subscribed") {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-italia-green">
        <CheckCircle className="h-4 w-4" />
        <span>You&apos;ll get a push when your order is ready</span>
      </div>
    );
  }

  const handleClick = async () => {
    setStatus("loading");
    const result = await ensurePushSubscription(vapidKey, phone);
    setStatus(result);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-italia-gold/30 bg-white px-4 py-3 text-sm font-semibold text-italia-dark shadow-sm hover:bg-italia-gold/10 disabled:opacity-60"
    >
      {status === "error" ? (
        <>
          <BellOff className="h-4 w-4 text-italia-red" />
          Couldn&apos;t enable — try again
        </>
      ) : (
        <>
          <Bell className="h-4 w-4 text-italia-gold-dark" />
          {status === "loading" ? "Setting up…" : "Notify me when ready"}
        </>
      )}
    </button>
  );
}
