"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, KanbanSquare, MapPin, Phone, RefreshCw, TableProperties, User } from "lucide-react";
import type { Order, OrderStatus } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { fulfillmentLabel } from "@/lib/fulfillment";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Dialog, Table, type BadgeTone, type ColumnV3 } from "./ui";

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
            <button type="button" className={view === "kanban" ? "is-active" : ""} aria-label="Kanban view" aria-selected={view === "kanban"} onClick={() => setView("kanban")}><KanbanSquare /></button>
            <button type="button" className={view === "table" ? "is-active" : ""} aria-label="Table view" aria-selected={view === "table"} onClick={() => setView("table")}><TableProperties /></button>
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
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Connecting to the order stream…</div>
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
              {detail.status !== "cancelled" && detail.status !== "completed" && (
                <Button variant="danger" size="sm" loading={updating === detail.id} onClick={() => changeStatus(detail.id, "cancelled")}>
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
    </>
  );
}
