"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle } from "lucide-react";
import { ensurePushSubscription, type PushOptInResult } from "@/lib/push-client";

/**
 * V8 order-confirmation web-push opt-in (audit §3). Surfaces only
 * after a successful order — the moment customers most want
 * "ping me when it's ready," and the browsers reward the high-intent
 * timing with high acceptance rates.
 *
 * Quietly hides when the browser doesn't support push, VAPID isn't
 * configured server-side, or the customer has already subscribed on
 * this device.
 */
export function PushOptInButton({ phone }: { phone?: string }) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
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
      <div className="v8-order-push-confirmed">
        <CheckCircle className="h-4 w-4" aria-hidden />
        <span>
          You&apos;ll get a push when your order is ready · <em>quando è pronto</em>
        </span>
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
      className={`v8-order-push${status === "error" ? " is-error" : ""}`}
    >
      {status === "error" ? (
        <>
          <span className="v8-order-push-icon" aria-hidden>
            <BellOff className="h-4 w-4" />
          </span>
          <span>Couldn&apos;t enable — try again</span>
        </>
      ) : (
        <>
          <span className="v8-order-push-icon" aria-hidden>
            <Bell className="h-4 w-4" />
          </span>
          <span>
            {status === "loading" ? "Setting up…" : "Notify me when ready · avvisami"}
          </span>
        </>
      )}
    </button>
  );
}
