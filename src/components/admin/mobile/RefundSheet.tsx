"use client";

import { useEffect, useMemo, useState } from "react";
import type { Order, RefundReasonCode } from "@/data/types";
import { REFUND_REASON_CODES, REFUND_REASON_LABELS } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { BottomSheet } from "../v2/mobile/BottomSheet";
import { SegmentControl } from "../v2/mobile/SegmentControl";
import { useToast } from "../v2/ui/Toast";

interface Props {
  order: Order | null;
  onClose: () => void;
  /** Called with the updated order when the refund posts. */
  onRefunded: (updated: Order) => void;
}

type Mode = "full" | "partial";

/**
 * Bottom-sheet refund flow. POSTs to /api/admin/orders/[id]/refund — the
 * same endpoint the desktop dialog uses. Default is "full refund, customer
 * request" because that's the dominant case on a phone (a customer just
 * called, manager refunds without leaving the conversation).
 */
export function RefundSheet({ order, onClose, onRefunded }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("full");
  const [amountPln, setAmountPln] = useState<string>("");
  const [reason, setReason] = useState<RefundReasonCode>("customer_request");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset when a different order is loaded.
  useEffect(() => {
    if (order) {
      setMode("full");
      setAmountPln(((order.totalAmount ?? 0) / 100).toFixed(2));
      setReason("customer_request");
      setNotes("");
    }
  }, [order]);

  const partialGrosze = useMemo(() => {
    if (mode !== "partial") return 0;
    const v = parseFloat(amountPln.replace(",", "."));
    if (!isFinite(v) || v <= 0) return 0;
    return Math.round(v * 100);
  }, [mode, amountPln]);

  const max = order?.totalAmount ?? 0;
  const overMax = mode === "partial" && partialGrosze > max;
  const amountValid =
    mode === "full" ? true : partialGrosze > 0 && !overMax;

  const submit = async () => {
    if (!order || !amountValid || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: mode,
          amount: mode === "partial" ? partialGrosze : undefined,
          reasonCode: reason,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        toast.error("Refund failed", data.error || "Try again in a moment.");
        return;
      }
      const updated: Order = await res.json();
      onRefunded(updated);
      toast.success(
        mode === "full" ? "Full refund processed" : "Partial refund processed",
        `${formatPrice(mode === "full" ? updated.totalAmount : partialGrosze)} · ${REFUND_REASON_LABELS[reason]}`,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const refundAmount = mode === "full" ? max : partialGrosze;

  return (
    <BottomSheet
      open={!!order}
      onClose={onClose}
      title={order ? `Refund order ${order.id.slice(-6)}` : ""}
      size="auto"
      footer={
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          style={{ flex: 1 }}
          disabled={!amountValid || busy}
          onClick={submit}
        >
          {busy
            ? "Processing…"
            : `Refund ${formatPrice(refundAmount)}`}
        </button>
      }
    >
      {!order ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SegmentControl<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "full", label: `Full · ${formatPrice(max)}` },
              { value: "partial", label: "Partial" },
            ]}
            ariaLabel="Refund mode"
          />

          {mode === "partial" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                background: "var(--surface-2)",
                border: `1px solid ${overMax ? "var(--danger)" : "var(--border)"}`,
                borderRadius: 10,
              }}
            >
              <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>Amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountPln}
                onChange={(e) => setAmountPln(e.target.value)}
                aria-label="Refund amount in złoty"
                placeholder="0.00"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: 0,
                  color: "var(--fg)",
                  fontSize: 16,
                  fontWeight: 500,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              />
              <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>zł</span>
            </label>
          )}

          {overMax && (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                background: "var(--danger-soft)",
                color: "var(--danger)",
                fontSize: 12.5,
              }}
            >
              Maximum refundable is {formatPrice(max)}.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: 0.04,
              }}
            >
              Reason
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {REFUND_REASON_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`v2-m-chip ${reason === code ? "is-active" : ""}`}
                  onClick={() => setReason(code)}
                >
                  {REFUND_REASON_LABELS[code]}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: 0.04,
              }}
            >
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What happened?"
              style={{
                resize: "none",
                padding: "10px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--fg)",
                fontSize: 16,
                fontFamily: "var(--font-ui)",
                outline: 0,
              }}
            />
          </label>
        </div>
      )}
    </BottomSheet>
  );
}
