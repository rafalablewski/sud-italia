"use client";

import { useEffect, useState } from "react";
import { Bell, Send } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { useToast } from "../ui/Toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PrefsResponse {
  muted: string[];
  available: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  new_order: "New orders",
  slot_full: "Slot full",
  low_slots: "Slot pressure",
  order_status: "Order status changes",
  bundle_low_margin: "Bundle margin alerts",
  dispute: "Stripe disputes",
  low_stock: "Low stock",
  cash_variance: "Cash variance",
  refund: "Refunds",
};

const CATEGORY_DESC: Record<string, string> = {
  new_order: "A new paid order lands on the kanban.",
  slot_full: "A delivery / pickup slot sold out.",
  low_slots: "A slot has only one spot left.",
  order_status: "Pending → confirmed / preparing / ready / completed.",
  bundle_low_margin: "A bundle's margin dropped below threshold.",
  dispute: "Stripe flagged an order as disputed.",
  low_stock: "An ingredient crossed below reorder point.",
  cash_variance: "A till closed > 50 zł off expected.",
  refund: "Someone else processed a refund.",
};

/**
 * Per-category opt-in + test push. Loads the operator's mute list from
 * /api/admin/push/prefs, toggles client-side, persists on every change.
 */
export function PushSettingsSheet({ open, onClose }: Props) {
  const toast = useToast();
  const [available, setAvailable] = useState<string[]>([]);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/push/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PrefsResponse | null) => {
        if (!d) return;
        setAvailable(d.available);
        setMuted(new Set(d.muted));
      })
      .catch(() => {});
  }, [open]);

  const toggle = async (cat: string) => {
    const next = new Set(muted);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setMuted(next);
    setBusy(true);
    try {
      await fetch("/api/admin/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted: Array.from(next) }),
      });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/push/test", { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as { sent?: number };
      if (r.ok && (data.sent ?? 0) > 0) {
        toast.success("Test push sent", "Check your lock screen.");
      } else if (r.ok) {
        toast.warning(
          "Nothing delivered",
          "Subscribed? VAPID keys configured? Check the More drawer toggle.",
        );
      } else {
        toast.error("Test failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Push notifications"
      size="full"
      footer={
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          style={{ flex: 1 }}
          onClick={sendTest}
          disabled={busy}
        >
          <Send className="h-4 w-4" aria-hidden /> Send test push
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 12,
            background: "var(--info-soft)",
            color: "var(--info)",
            borderRadius: 10,
            fontSize: 12.5,
            marginBottom: 8,
          }}
        >
          <Bell className="h-4 w-4" aria-hidden />
          Mute categories you don&apos;t want on your lock screen. The bell badge
          inside the admin still updates regardless.
        </div>

        <ul role="list" className="v2-m-list">
          {available.map((cat) => {
            const isMuted = muted.has(cat);
            return (
              <li key={cat}>
                <button
                  type="button"
                  className="v2-m-list-row"
                  onClick={() => toggle(cat)}
                  disabled={busy}
                  aria-pressed={!isMuted}
                >
                  <span
                    className={`v2-m-list-check ${!isMuted ? "is-on" : ""}`}
                    aria-hidden
                  />
                  <span className="v2-m-list-stack">
                    <span className="v2-m-list-title">
                      {CATEGORY_LABELS[cat] ?? cat}
                    </span>
                    <span className="v2-m-list-sub">
                      {CATEGORY_DESC[cat] ?? ""}
                    </span>
                  </span>
                  <span
                    className={`v2-m-pill ${isMuted ? "v2-m-pill-neutral" : "v2-m-pill-success"}`}
                  >
                    {isMuted ? "Muted" : "On"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}
