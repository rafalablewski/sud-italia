"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, KanbanSquare, MapPin, Phone, RefreshCw, RotateCcw, TableProperties, User } from "lucide-react";
import type { Order, OrderStatus } from "@/data/types";
import { REFUND_REASON_CODES, REFUND_REASON_LABELS, type RefundReasonCode } from "@/data/types";
import { evaluateRefundGuard, type RefundGuardDecision } from "@/lib/refund-guard";
import type { AdminRole } from "@/lib/admin-roles";
import { formatPrice } from "@/lib/utils";
import { fulfillmentLabel } from "@/lib/fulfillment";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, ChipRow, type ColumnV3, Dialog, SkeletonKanban, SkeletonRows, Table } from "./ui";

const PIPELINE: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "completed"];
const KANBAN_COLUMNS: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "completed"];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Assigned",
  picked_up: "Picked up",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: "warn",
  confirmed: "info",
  preparing: "info",
  ready: "brand",
  assigned: "info",
  picked_up: "ok",
  delivered: "ok",
  completed: "ok",
  cancelled: "bad",
};
const TONE_VAR: Record<BadgeTone, string> = {
  neutral: "var(--av3-subtle)",
  ok: "var(--av3-ok)",
  warn: "var(--av3-warn)",
  bad: "var(--av3-bad)",
  info: "var(--av3-info)",
  brand: "var(--av3-brand)",
};

function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = PIPELINE.indexOf(s);
  if (i < 0 || i >= PIPELINE.length - 1) return null;
  return PIPELINE[i + 1];
}
function fmtAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(s)) return "";
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function lineTotal(o: Order): number {
  return o.items.reduce((s, it) => s + (it.menuItem?.price ?? 0) * it.quantity, 0);
}

export function OrdersV3() {
  const { location } = useAdminLocationV3();
  const { orders: streamed, loading, refresh } = useAdminOrdersStream(location);
  const [orders, setOrders] = useState<Order[]>([]);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setOrders(streamed);
    setRefreshing(false);
  }, [streamed]);

  const counts = useMemo(() => {
    const c = { all: orders.length } as Record<string, number>;
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const byStatus = useMemo(() => {
    const m = new Map<OrderStatus, Order[]>();
    for (const col of KANBAN_COLUMNS) m.set(col, []);
    for (const o of orders) {
      if (m.has(o.status)) m.get(o.status)!.push(o);
    }
    return m;
  }, [orders]);

  const tableRows = useMemo(() => {
    const rows = filter === "all" ? orders : orders.filter((o) => o.status === filter);
    return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, filter]);

  const detail = detailId ? orders.find((o) => o.id === detailId) ?? null : null;
  const refundTarget = refundId ? orders.find((o) => o.id === refundId) ?? null : null;

  async function changeStatus(orderId: string, status: OrderStatus) {
    setUpdating(orderId);
    // optimistic — the next SSE frame reconciles
    setOrders((arr) => arr.map((o) => (o.id === orderId ? { ...o, status } : o)));
    try {
      await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status }),
      });
    } finally {
      setUpdating(null);
    }
  }

  // Refund reaches Stripe + reverses revenue rows — owner/manager + the
  // orders.refund grant only (server-enforced). The SSE stream reconciles the
  // order's `refund` field (and `cancelled` status for full refunds) after.
  async function handleRefund(
    orderId: string,
    payload: { type: "full" | "partial"; amount?: number; reasonCode: RefundReasonCode; notes?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      refresh();
      return { ok: true };
    }
    return { ok: false, error: data.error || "Refund failed" };
  }

  const filterChips: ("all" | OrderStatus)[] = ["all", "pending", "confirmed", "preparing", "ready", "completed", "cancelled"];

  const tableCols: ColumnV3<Order>[] = [
    { key: "id", header: "Order", render: (o) => <span className="av3-cell-muted">#{o.id.slice(-5)}</span> },
    { key: "time", header: "Age", render: (o) => <span className="av3-cell-muted">{fmtAgo(o.createdAt)}</span> },
    { key: "customer", header: "Customer", render: (o) => o.customerName || "Walk-in" },
    { key: "type", header: "Type", render: (o) => <span className="av3-cell-muted">{fulfillmentLabel(o.fulfillmentType)}</span> },
    { key: "status", header: "Status", render: (o) => <Badge tone={STATUS_TONE[o.status]} dot>{STATUS_LABEL[o.status]}</Badge> },
    { key: "total", header: "Total", num: true, render: (o) => formatPrice(o.totalAmount) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Orders</h1>
          <div className="av3-pagehead-sub">Live order pipeline · streams in real time</div>
        </div>
        <div className="av3-pagehead-actions">
          <div className="av3-viewtoggle" role="tablist" aria-label="View">
            <button type="button" role="tab" className={view === "kanban" ? "is-active" : ""} aria-label="Kanban view" aria-selected={view === "kanban"} onClick={() => setView("kanban")}><KanbanSquare /></button>
            <button type="button" role="tab" className={view === "table" ? "is-active" : ""} aria-label="Table view" aria-selected={view === "table"} onClick={() => setView("table")}><TableProperties /></button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); refresh(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      {view === "table" && (
        <div className="av3-filterchips">
          {filterChips.map((f) => (
            <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : STATUS_LABEL[f]}
              <span className="av3-fchip-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {loading && orders.length === 0 ? (
        view === "kanban" ? <SkeletonKanban /> : <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : orders.length === 0 ? (
        <div className="av3-card"><div className="av3-empty"><div className="av3-empty-title">No orders yet</div><div className="av3-empty-text">New orders stream in here the moment they’re placed.</div></div></div>
      ) : view === "kanban" ? (
        <div className="av3-kanban">
          {KANBAN_COLUMNS.map((col) => {
            const list = byStatus.get(col) ?? [];
            return (
              <div className="av3-kcol" key={col}>
                <div className="av3-kcol-head">
                  <span className="av3-kcol-title">{STATUS_LABEL[col]}</span>
                  <span className="av3-kcol-count">{list.length}</span>
                </div>
                <div className="av3-kcol-body">
                  {list.length === 0 ? (
                    <div className="av3-empty-text" style={{ padding: "10px 4px", fontSize: 11.5, color: "var(--av3-subtle)" }}>—</div>
                  ) : (
                    list
                      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                      .map((o) => (
                        <button type="button" className="av3-ocard" key={o.id} onClick={() => setDetailId(o.id)}>
                          <div className="av3-ocard-top">
                            <span className="av3-ocard-id">#{o.id.slice(-5)}</span>
                            <span className="av3-ocard-amt">{formatPrice(o.totalAmount)}</span>
                          </div>
                          <div className="av3-ocard-name">{o.customerName || "Walk-in"}</div>
                          <div className="av3-ocard-meta">
                            <span className="av3-ocard-dot" style={{ background: TONE_VAR[STATUS_TONE[o.status]] }} />
                            {fulfillmentLabel(o.fulfillmentType)}
                            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3 }}><Clock />{fmtAgo(o.createdAt)}</span>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="av3-card av3-card-p" style={{ padding: 0 }}>
          {tableRows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-text">No {filter === "all" ? "" : STATUS_LABEL[filter].toLowerCase()} orders.</div></div>
          ) : (
            <Table columns={tableCols} rows={tableRows} rowKey={(o) => o.id} onRowClick={(o) => setDetailId(o.id)} />
          )}
        </div>
      )}

      {/* detail dialog */}
      <Dialog
        open={!!detail}
        onClose={() => setDetailId(null)}
        title={detail ? `Order #${detail.id.slice(-6)}` : ""}
        subtitle={detail ? `${fulfillmentLabel(detail.fulfillmentType)} · placed ${fmtAgo(detail.createdAt)} ago` : undefined}
        headerExtra={detail ? <Badge tone={STATUS_TONE[detail.status]} dot>{STATUS_LABEL[detail.status]}</Badge> : undefined}
        width={560}
        footer={
          detail && (
            <>
              {!detail.refund && detail.status !== "cancelled" && detail.status !== "pending" && (
                <Button variant="danger" size="sm" onClick={() => setRefundId(detail.id)} style={{ marginRight: "auto" }}>
                  <RotateCcw className="av3-btn-ico" /> Refund
                </Button>
              )}
              {detail.status !== "cancelled" && detail.status !== "completed" && (
                <Button variant="ghost" size="sm" loading={updating === detail.id} onClick={() => changeStatus(detail.id, "cancelled")}>
                  Cancel order
                </Button>
              )}
              {nextStatus(detail.status) && (
                <Button variant="primary" size="sm" loading={updating === detail.id} onClick={() => changeStatus(detail.id, nextStatus(detail.status)!)}>
                  Move to {STATUS_LABEL[nextStatus(detail.status)!]}
                </Button>
              )}
            </>
          )
        }
      >
        {detail && (
          <>
            <div className="av3-od-grid">
              <div className="av3-od-field"><div className="k"><User style={{ width: 12, height: 12, display: "inline", verticalAlign: "-1px", marginRight: 4 }} />Customer</div><div className="v">{detail.customerName || "Walk-in"}</div></div>
              <div className="av3-od-field"><div className="k"><Phone style={{ width: 12, height: 12, display: "inline", verticalAlign: "-1px", marginRight: 4 }} />Phone</div><div className="v">{detail.customerPhone || "—"}</div></div>
              <div className="av3-od-field"><div className="k"><MapPin style={{ width: 12, height: 12, display: "inline", verticalAlign: "-1px", marginRight: 4 }} />Slot</div><div className="v">{detail.slotDate} · {detail.slotTime}</div></div>
              <div className="av3-od-field"><div className="k">Fulfilment</div><div className="v">{fulfillmentLabel(detail.fulfillmentType)}{detail.partySize ? ` · party of ${detail.partySize}` : ""}</div></div>
              {detail.deliveryAddress && (
                <div className="av3-od-field" style={{ gridColumn: "1 / -1" }}><div className="k">Address</div><div className="v">{detail.deliveryAddress}</div></div>
              )}
              {detail.specialInstructions && (
                <div className="av3-od-field" style={{ gridColumn: "1 / -1" }}><div className="k">Notes</div><div className="v">{detail.specialInstructions}</div></div>
              )}
            </div>

            {detail.refund && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px", background: "var(--av3-bad-soft)", border: "1px solid color-mix(in oklab, var(--av3-bad) 30%, transparent)", borderRadius: "var(--av3-r-sm)", fontSize: 12 }}>
                <RotateCcw style={{ width: 14, height: 14, color: "var(--av3-bad)" }} />
                <span style={{ color: "var(--av3-bad)", fontWeight: 600 }}>{detail.refund.type === "full" ? "Refunded" : "Partially refunded"}</span>
                <span className="av3-cell-muted">{formatPrice(detail.refund.amount)} · {REFUND_REASON_LABELS[detail.refund.reasonCode]}</span>
              </div>
            )}

            <div className="av3-section-label" style={{ marginBottom: 6 }}>Items</div>
            {detail.items.map((it, i) => (
              <div className="av3-od-line" key={i}>
                <div style={{ minWidth: 0 }}>
                  <span className="q">{it.quantity}×</span>{it.menuItem?.name ?? "Item"}
                  {it.notes && <div className="av3-od-note">{it.notes}</div>}
                </div>
                <span className="lp">{formatPrice((it.menuItem?.price ?? 0) * it.quantity)}</span>
              </div>
            ))}
            <div className="av3-od-total">
              <span className="av3-section-label" style={{ marginBottom: 0 }}>Total{lineTotal(detail) !== detail.totalAmount ? " (incl. modifiers/combos)" : ""}</span>
              <span className="v">{formatPrice(detail.totalAmount)}</span>
            </div>
          </>
        )}
      </Dialog>

      {refundTarget && (
        <RefundDialogV3
          order={refundTarget}
          onClose={() => setRefundId(null)}
          onSubmit={async (payload) => {
            const result = await handleRefund(refundTarget.id, payload);
            if (result.ok) setRefundId(null);
            return result;
          }}
        />
      )}
    </>
  );
}

interface RefundPolicy {
  role: AdminRole;
  ownerBypass: boolean;
  singleMaxGrosze: number;
  compDailyCapGrosze: number;
  actorCompTotalTodayGrosze: number;
}

function RefundDialogV3({
  order,
  onClose,
  onSubmit,
}: {
  order: Order;
  onClose: () => void;
  onSubmit: (p: { type: "full" | "partial"; amount?: number; reasonCode: RefundReasonCode; notes?: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [type, setType] = useState<"full" | "partial">("full");
  const [amountPln, setAmountPln] = useState("");
  const [reasonCode, setReasonCode] = useState<RefundReasonCode>("customer_request");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<RefundPolicy | null>(null);

  // Preview the authorization decision (audit §11.2). Falls back to "allow" if
  // the policy fetch fails; the server has the final word either way.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/refund-policy?location=${encodeURIComponent(order.locationSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setPolicy(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [order.locationSlug]);

  const partialGrosze = type === "partial" ? Math.round(parseFloat(amountPln || "0") * 100) : 0;
  const partialValid =
    type === "full" || (Number.isFinite(partialGrosze) && partialGrosze > 0 && partialGrosze < order.totalAmount);
  const previewAmount = type === "full" ? order.totalAmount : partialGrosze;
  const willReverseStripe = !!order.stripePaymentIntentId && reasonCode !== "manager_comp";

  const guard: RefundGuardDecision =
    policy && previewAmount > 0
      ? evaluateRefundGuard({
          role: policy.role,
          reasonCode,
          amountGrosze: previewAmount,
          actorCompTotalTodayGrosze: policy.actorCompTotalTodayGrosze,
          limits: { singleMaxGrosze: policy.singleMaxGrosze, compDailyCapGrosze: policy.compDailyCapGrosze },
        })
      : { allowed: true };
  const compRemaining =
    policy && !policy.ownerBypass && policy.compDailyCapGrosze > 0
      ? Math.max(0, policy.compDailyCapGrosze - policy.actorCompTotalTodayGrosze)
      : null;

  const submit = async () => {
    if (!partialValid || !guard.allowed) return;
    setSubmitting(true);
    setError(null);
    const result = await onSubmit({
      type,
      amount: type === "partial" ? partialGrosze : undefined,
      reasonCode,
      notes: notes.trim() || undefined,
    });
    if (!result.ok) {
      setSubmitting(false);
      setError(result.error || "Refund failed");
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Refund order"
      subtitle={`Original total ${formatPrice(order.totalAmount)} · ${order.customerName || "Guest"}`}
      width={460}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="danger" size="sm" loading={submitting} disabled={submitting || !partialValid || !guard.allowed} onClick={submit}>
            <RotateCcw className="av3-btn-ico" />
            {!guard.allowed ? "Owner approval required" : `Refund ${previewAmount > 0 ? formatPrice(previewAmount) : "…"}`}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ChipRow
          options={[
            { value: "full", label: "Full refund" },
            { value: "partial", label: "Partial refund" },
          ]}
          value={type}
          onChange={(v) => setType(v)}
          ariaLabel="Refund type"
        />

        {type === "partial" && (
          <label className="av3-field">
            <span className="av3-field-label">Amount (PLN)</span>
            <input className="av3-input" type="number" step="0.01" min="0.01" inputMode="decimal" value={amountPln} onChange={(e) => setAmountPln(e.target.value)} placeholder="0.00" />
            <span style={{ fontSize: 11, color: amountPln && !partialValid ? "var(--av3-bad)" : "var(--av3-subtle)" }}>
              {amountPln && !partialValid
                ? `Enter an amount between 0.01 and ${(order.totalAmount / 100 - 0.01).toFixed(2)}`
                : `Up to ${formatPrice(order.totalAmount - 1)}. Stored in grosze.`}
            </span>
          </label>
        )}

        <label className="av3-field">
          <span className="av3-field-label">Reason</span>
          <select className="av3-select" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as RefundReasonCode)}>
            {REFUND_REASON_CODES.map((c) => (
              <option key={c} value={c}>{REFUND_REASON_LABELS[c]}</option>
            ))}
          </select>
        </label>

        <label className="av3-field">
          <span className="av3-field-label">Notes (optional)</span>
          <textarea
            className="av3-input"
            rows={2}
            style={{ height: "auto", fontFamily: "var(--av3-ui)", padding: "8px 10px", resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal record — not sent to the customer."
          />
        </label>

        <div style={{ background: "var(--av3-s2)", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-sm)", padding: "10px 12px", fontSize: 12, lineHeight: 1.5, color: "var(--av3-muted)" }}>
          {willReverseStripe ? (
            <><strong>Stripe charge will be reversed</strong> for {formatPrice(previewAmount)}. Funds typically return in 5–10 business days.</>
          ) : order.stripePaymentIntentId ? (
            <><strong>Manager comp:</strong> recorded internally; the original Stripe charge will NOT be reversed. Use this when the customer is credited offline.</>
          ) : (
            <><strong>No Stripe charge on file</strong> (demo-mode order or webhook hadn&apos;t fired). The refund is recorded internally for accounting.</>
          )}
          {type === "full" && (
            <><br />The order status will be set to <strong>cancelled</strong>.</>
          )}
          {reasonCode === "manager_comp" && compRemaining !== null && guard.allowed && (
            <><br />Comp budget left today: <strong>{formatPrice(compRemaining)}</strong> of {formatPrice(policy!.compDailyCapGrosze)}.</>
          )}
        </div>

        {!guard.allowed && guard.message && (
          <div style={{ fontSize: 12, color: "var(--av3-bad)", background: "var(--av3-bad-soft)", border: "1px solid color-mix(in oklab, var(--av3-bad) 30%, transparent)", borderRadius: "var(--av3-r-sm)", padding: "8px 10px" }}>
            {guard.message}
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: "var(--av3-bad)" }}>{error}</div>}
      </div>
    </Dialog>
  );
}
