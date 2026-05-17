"use client";

import { useEffect, useMemo, useState } from "react";
import type { Order } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { BottomSheet } from "../v2/mobile/BottomSheet";
import { SegmentControl } from "../v2/mobile/SegmentControl";
import { useToast } from "../v2/ui/Toast";

interface Props {
  order: Order | null;
  onClose: () => void;
  /** Called with the updated order after the comp posts. */
  onCompApplied: (updated: Order) => void;
}

type Mode = "item" | "amount" | "percent";

const REASONS = [
  "Wrong order",
  "Slow service",
  "Quality issue",
  "Goodwill",
  "Manager comp",
] as const;

/**
 * Comp / discount sheet — distinct from RefundSheet. A comp is an off-the-bill
 * adjustment that doesn't (necessarily) reverse a Stripe charge. We model it
 * by POSTing to the same /refund endpoint with reasonCode=manager_comp +
 * type=partial — that's how desktop's "comp" path works under the hood, and
 * what existing reports rely on (comp shows up as a refund with that reason).
 *
 * Three modes: pick one line item to comp, type an amount, or a percent of
 * the order total.
 */
export function CompSheet({ order, onClose, onCompApplied }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("amount");
  const [amountPln, setAmountPln] = useState<string>("");
  const [percent, setPercent] = useState<number>(10);
  const [itemIdx, setItemIdx] = useState<number>(0);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    setMode("amount");
    setAmountPln("");
    setPercent(10);
    setItemIdx(0);
    setReason(REASONS[0]);
  }, [order]);

  const max = order?.totalAmount ?? 0;

  const compGrosze = useMemo(() => {
    if (!order) return 0;
    if (mode === "item") {
      const it = order.items[itemIdx];
      if (!it) return 0;
      return it.menuItem.price * it.quantity;
    }
    if (mode === "percent") {
      return Math.round((max * percent) / 100);
    }
    const v = parseFloat(amountPln.replace(",", "."));
    if (!isFinite(v) || v <= 0) return 0;
    return Math.round(v * 100);
  }, [order, mode, itemIdx, percent, amountPln, max]);

  const overMax = compGrosze > max;
  const valid = compGrosze > 0 && !overMax;

  const submit = async () => {
    if (!order || !valid || busy) return;
    setBusy(true);
    try {
      const notes =
        mode === "item"
          ? `Comp · ${order.items[itemIdx]?.menuItem.name} · ${reason}`
          : mode === "percent"
            ? `Comp ${percent}% · ${reason}`
            : `Comp · ${reason}`;
      const r = await fetch(`/api/admin/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "partial",
          amount: compGrosze,
          reasonCode: "manager_comp",
          notes,
        }),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Comp failed", data.error || "Try again in a moment.");
        return;
      }
      const updated: Order = await r.json();
      onCompApplied(updated);
      toast.success("Comp applied", `${formatPrice(compGrosze)} · ${reason}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={!!order}
      onClose={onClose}
      title={order ? `Comp order ${order.id.slice(-6)}` : ""}
      size="auto"
      footer={
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          style={{ flex: 1 }}
          disabled={!valid || busy}
          onClick={submit}
        >
          {busy ? "Applying…" : `Comp ${formatPrice(compGrosze)}`}
        </button>
      }
    >
      {!order ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SegmentControl<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "item", label: "Item" },
              { value: "amount", label: "Amount" },
              { value: "percent", label: "Percent" },
            ]}
            ariaLabel="Comp mode"
          />

          {mode === "item" && (
            <ul role="list" className="v2-m-list">
              {order.items.map((it, i) => (
                <li key={`${it.menuItem.id}-${i}`}>
                  <button
                    type="button"
                    className="v2-m-list-row"
                    onClick={() => setItemIdx(i)}
                  >
                    <span
                      className={`v2-m-list-check ${i === itemIdx ? "is-on" : ""}`}
                      aria-hidden
                    />
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">
                        {it.quantity}× {it.menuItem.name}
                      </span>
                      <span className="v2-m-list-sub">{it.menuItem.category}</span>
                    </span>
                    <span className="tabular v2-m-list-metric">
                      {formatPrice(it.menuItem.price * it.quantity)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mode === "amount" && (
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
                aria-label="Comp amount in złoty"
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

          {mode === "percent" && (
            <div
              style={{
                padding: "12px 14px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>Percent</span>
                <span className="tabular" style={{ fontWeight: 500 }}>
                  {percent}% · {formatPrice(compGrosze)}
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                aria-label="Comp percentage"
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[10, 20, 50, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`v2-m-chip ${percent === p ? "is-active" : ""}`}
                    onClick={() => setPercent(p)}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
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
              Comp can&apos;t exceed the order total ({formatPrice(max)}).
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
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`v2-m-chip ${reason === r ? "is-active" : ""}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
