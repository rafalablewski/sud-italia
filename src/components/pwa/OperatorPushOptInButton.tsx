"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle } from "lucide-react";
import { ensureAdminPushSubscription, type PushOptInResult } from "@/lib/push-client";

/**
 * Operator push opt-in for the OttavianoKDS launcher. Subscribes THIS device
 * (the KDS tablet / owner's phone) to admin pushes — "New order · 84 zł",
 * refunds, cash variance, low slots — via /api/admin/push/subscribe (the admin
 * cookie identifies the user). Mirrors the customer PushOptInButton but for the
 * operator channel. Self-hides when push is unsupported, VAPID isn't configured,
 * or already subscribed; the emission side is already wired (pushToAdmins).
 */
export function OperatorPushOptInButton() {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [status, setStatus] = useState<"idle" | "loading" | PushOptInResult>(() => {
    if (typeof window === "undefined") return "idle";
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return "idle";
  });

  useEffect(() => {
    if (status !== "idle") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setStatus("already-subscribed");
      })
      .catch(() => {});
  }, [status]);

  // Nothing to offer → render nothing (keeps the launcher clean).
  if (!vapidKey || status === "unsupported" || status === "denied") return null;

  if (status === "already-subscribed" || status === "subscribed") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[#16202C] px-4 py-2 text-sm text-[#33C26A] ring-1 ring-[#2B3A4D]">
        <CheckCircle size={16} aria-hidden />
        Order alerts on for this device
      </span>
    );
  }

  const handleClick = async () => {
    setStatus("loading");
    setStatus(await ensureAdminPushSubscription(vapidKey));
  };

  const isError = status === "error";
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition active:scale-95 ${
        isError ? "bg-[#3a1d22] text-[#E1556B]" : "bg-[#E8B23A] text-[#11161F]"
      }`}
    >
      {isError ? <BellOff size={18} aria-hidden /> : <Bell size={18} aria-hidden />}
      {status === "loading"
        ? "Enabling…"
        : isError
          ? "Couldn't enable — try again"
          : "Enable order alerts"}
    </button>
  );
}
