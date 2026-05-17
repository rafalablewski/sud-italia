"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  RotateCcw,
  Search,
  Undo2,
} from "lucide-react";
import type { Order, OrderStatus } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useAdminLocation } from "../v2/LocationContext";
import {
  BottomSheet,
  BulkActionBar,
  Chip,
  ChipStrip,
  MobilePage,
  MobileList,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  useMultiSelect,
  type MobileListItem,
} from "../v2/mobile";
import { useToast } from "../v2/ui/Toast";
import { CompSheet } from "./CompSheet";
import { RefundSheet } from "./RefundSheet";
import { useActionTiming } from "../v2/mobile/useActionTiming";

const PIPELINE_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
};

const STATUS_TONE: Record<OrderStatus, "info" | "success" | "warning" | "danger" | "brand" | "neutral"> = {
  pending: "warning",
  confirmed: "info",
  preparing: "info",
  ready: "success",
  assigned: "info",
  picked_up: "info",
  delivered: "success",
  completed: "neutral",
  cancelled: "danger",
};

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

type Filter = "live" | "pending" | "preparing" | "ready" | "done";

const FILTERS: { value: Filter; label: string; match: (s: OrderStatus) => boolean }[] = [
  { value: "live", label: "Live", match: (s) => s !== "completed" && s !== "cancelled" && s !== "delivered" },
  { value: "pending", label: "Pending", match: (s) => s === "pending" },
  { value: "preparing", label: "Preparing", match: (s) => s === "preparing" || s === "confirmed" },
  { value: "ready", label: "Ready", match: (s) => s === "ready" },
  { value: "done", label: "Done", match: (s) => s === "completed" || s === "delivered" },
];

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function MobileOrders() {
  const { location } = useAdminLocation();
  const toast = useToast();
  const { orders: streamOrders, refresh: refreshStream } = useAdminOrdersStream(location);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Filter>("live");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Order | null>(null);
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [comping, setComping] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const multi = useMultiSelect();
  const timing = useActionTiming();

  // Mirror stream into local state so optimistic mutations can shadow it
  // until the server confirms.
  useEffect(() => {
    setOrders(streamOrders);
  }, [streamOrders]);

  useEffect(() => {
    // Tick relative timestamps once a minute.
    const tick = window.setInterval(() => setOrders((o) => [...o]), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const refresh = async () => {
    refreshStream();
  };

  const advanceStatus = async (order: Order, statusOverride?: OrderStatus) => {
    const target = statusOverride ?? PIPELINE_NEXT[order.status];
    if (!target) return;
    setBusy(order.id);
    const prevStatus = order.status;
    setOrders((arr) =>
      arr.map((o) => (o.id === order.id ? { ...o, status: target } : o)),
    );
    try {
      const r = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, status: target }),
      });
      if (!r.ok) throw new Error("status update failed");
      toast.success(`Moved to ${STATUS_LABEL[target]}`);
    } catch {
      // Rollback on failure.
      setOrders((arr) =>
        arr.map((o) => (o.id === order.id ? { ...o, status: prevStatus } : o)),
      );
      toast.error("Could not update order");
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const matcher = FILTERS.find((f) => f.value === filter)?.match ?? (() => true);
    const needle = q.trim().toLowerCase();
    return orders
      .filter((o) => matcher(o.status))
      .filter((o) => {
        if (!needle) return true;
        return (
          o.id.toLowerCase().includes(needle) ||
          o.customerName.toLowerCase().includes(needle) ||
          o.customerPhone.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, filter, q]);

  const counts = useMemo(() => {
    const map = new Map<Filter, number>();
    for (const f of FILTERS) {
      map.set(f.value, orders.filter((o) => f.match(o.status)).length);
    }
    return map;
  }, [orders]);

  const items: MobileListItem<Order>[] = filtered.map((o) => {
    const next = PIPELINE_NEXT[o.status];
    return {
      id: o.id,
      data: o,
      icon: o.fulfillmentType === "delivery" ? Clock : CheckCircle2,
      iconTone: STATUS_TONE[o.status],
      title: `${o.customerName} · ${formatPrice(o.totalAmount)}`,
      subtitle: `${o.id.slice(-6)} · ${fmtAgo(o.createdAt)} · ${o.fulfillmentType}`,
      status: { label: STATUS_LABEL[o.status], tone: STATUS_TONE[o.status] },
      onTap: () => setDetail(o),
      onLongPress: () => multi.toggle(o.id),
      rightAction: next
        ? {
            label: STATUS_LABEL[next],
            tone: "success",
            onCommit: () => advanceStatus(o),
          }
        : undefined,
      leftAction:
        o.status !== "completed" && o.status !== "cancelled"
          ? {
              label: "Cancel",
              tone: "danger",
              onCommit: () => advanceStatus(o, "cancelled"),
            }
          : undefined,
    };
  });

  const bulkAdvance = async () => {
    const targets = filtered.filter((o) => multi.selected.has(o.id));
    multi.clear();
    for (const o of targets) {
      if (PIPELINE_NEXT[o.status]) {
        // Sequential is intentional — concurrent PUTs on the same backing
        // store can collide on the in-memory lock during local dev.
        await advanceStatus(o);
      }
    }
  };

  const bulkCancel = async () => {
    const targets = filtered.filter(
      (o) => multi.selected.has(o.id) && o.status !== "completed" && o.status !== "cancelled",
    );
    multi.clear();
    for (const o of targets) {
      await advanceStatus(o, "cancelled");
    }
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SegmentControl<Filter>
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
              ariaLabel="Order filter"
            />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--fg-subtle)",
              }}
            >
              <Search className="h-4 w-4" aria-hidden />
              <input
                type="search"
                inputMode="search"
                placeholder="Search by name, phone, ID…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: 0,
                  color: "var(--fg)",
                  fontSize: "var(--m-text-base)",
                  fontFamily: "var(--font-ui)",
                }}
              />
            </label>
          </div>
        }
      >
        <PageHeader
          title="Orders"
          subtitle={`${filtered.length} ${filter === "done" ? "completed" : "active"}`}
          actions={
            <ChipStrip>
              {FILTERS.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  active={filter === f.value}
                  count={counts.get(f.value)}
                  onClick={() => setFilter(f.value)}
                />
              ))}
            </ChipStrip>
          }
        />

        <MobileList
          items={items}
          multi={multi}
          empty={
            <div className="v2-m-empty">
              <div className="v2-m-empty-title">No orders</div>
              <div className="v2-m-empty-desc">Nothing matches this filter right now.</div>
            </div>
          }
        />

        <BulkActionBar open={multi.isActive} count={multi.count} onClear={multi.clear}>
          <button
            type="button"
            className="v2-m-btn v2-m-btn-ghost"
            onClick={bulkCancel}
            disabled={multi.count === 0}
          >
            Cancel
          </button>
          <button
            type="button"
            className="v2-m-btn v2-m-btn-primary"
            onClick={bulkAdvance}
            disabled={multi.count === 0}
          >
            Advance
          </button>
        </BulkActionBar>
      </MobilePage>

      <BottomSheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Order ${detail.id.slice(-6)}` : ""}
        size="full"
        footer={
          detail && PIPELINE_NEXT[detail.status] ? (
            <button
              type="button"
              className="v2-m-btn v2-m-btn-primary"
              style={{ flex: 1 }}
              disabled={busy === detail.id}
              onClick={() => {
                advanceStatus(detail);
                setDetail(null);
              }}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
              Move to {STATUS_LABEL[PIPELINE_NEXT[detail.status]!]}
            </button>
          ) : null
        }
      >
        {detail && (
          <OrderDetail
            order={detail}
            onCancel={() => {
              advanceStatus(detail, "cancelled");
              setDetail(null);
            }}
            onRefund={() => {
              timing.start("orders.refund");
              setRefunding(detail);
              setDetail(null);
            }}
            onComp={() => {
              timing.start("orders.comp");
              setComping(detail);
              setDetail(null);
            }}
            busy={busy === detail.id}
          />
        )}
      </BottomSheet>

      <RefundSheet
        order={refunding}
        onClose={() => {
          timing.stop("orders.refund", { committed: false });
          setRefunding(null);
        }}
        onRefunded={(updated) => {
          timing.stop("orders.refund", { committed: true, orderId: updated.id });
          setOrders((arr) => arr.map((o) => (o.id === updated.id ? updated : o)));
        }}
      />

      <CompSheet
        order={comping}
        onClose={() => {
          timing.stop("orders.comp", { committed: false });
          setComping(null);
        }}
        onCompApplied={(updated) => {
          timing.stop("orders.comp", { committed: true, orderId: updated.id });
          setOrders((arr) => arr.map((o) => (o.id === updated.id ? updated : o)));
        }}
      />
    </PullToRefresh>
  );
}

function OrderDetail({
  order,
  onCancel,
  onRefund,
  onComp,
  busy,
}: {
  order: Order;
  onCancel: () => void;
  onRefund: () => void;
  onComp: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 12,
          background: "var(--surface-2)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>Customer</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{order.customerName}</div>
        <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{order.customerPhone}</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <DetailTile label="Status" value={STATUS_LABEL[order.status]} tone={STATUS_TONE[order.status]} />
        <DetailTile label="Fulfilment" value={order.fulfillmentType} />
        <DetailTile label="Slot" value={`${order.slotDate} ${order.slotTime}`} />
        <DetailTile label="Total" value={formatPrice(order.totalAmount)} />
      </div>

      <section>
        <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.06, textTransform: "uppercase", color: "var(--fg-subtle)", margin: "0 0 6px" }}>
          Items
        </h4>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {order.items.map((it, i) => (
            <li
              key={`${it.menuItem.id}-${i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                padding: 10,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  <span>{it.quantity}× </span>
                  <span>{it.menuItem.name}</span>
                </div>
                {it.notes && (
                  <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{it.notes}</div>
                )}
              </div>
              <div className="tabular" style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
                {formatPrice(it.menuItem.price * it.quantity)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {order.specialInstructions && (
        <section
          style={{
            padding: 12,
            background: "var(--warning-soft)",
            border: "1px solid color-mix(in oklab, var(--warning) 30%, transparent)",
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--warning)", marginBottom: 4 }}>
            Notes
          </div>
          <div style={{ fontSize: 13, color: "var(--fg)" }}>{order.specialInstructions}</div>
        </section>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {order.paidAt && !order.refund && (
          <>
            <button
              type="button"
              onClick={onRefund}
              disabled={busy}
              className="v2-m-btn v2-m-btn-ghost"
              style={{ flex: "1 1 0" }}
            >
              <Undo2 className="h-4 w-4" aria-hidden /> Refund
            </button>
            <button
              type="button"
              onClick={onComp}
              disabled={busy}
              className="v2-m-btn v2-m-btn-ghost"
              style={{ flex: "1 1 0" }}
            >
              Comp
            </button>
          </>
        )}
        {order.status !== "completed" && order.status !== "cancelled" && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="v2-m-btn v2-m-btn-ghost"
            style={{ flex: "1 1 0", color: "var(--danger)" }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Cancel
          </button>
        )}
      </div>

      {order.refund && (
        <div
          style={{
            padding: 12,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: 0.04 }}>
            Refund on record
          </div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {order.refund.type === "full" ? "Full" : "Partial"} ·{" "}
            <span className="tabular">{formatPrice(order.refund.amount)}</span>
          </div>
          {order.refund.notes && (
            <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{order.refund.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailTile({ label, value, tone }: { label: string; value: string; tone?: keyof typeof STATUS_TONE | "info" | "success" | "warning" | "danger" | "brand" | "neutral" }) {
  return (
    <div
      style={{
        padding: 10,
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--fg-subtle)" }}>
        {label}
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: tone ? `var(--${typeof tone === "string" && tone in STATUS_TONE ? "fg" : "fg"})` : "var(--fg)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
