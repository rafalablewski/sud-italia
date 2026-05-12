"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Clock,
  KanbanSquare,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
  Truck,
  TableProperties,
  Trash2,
  User,
} from "lucide-react";
import type { Order, OrderStatus } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { formatSlotDate } from "@/lib/format";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  ORDER_STATUS_TONE,
  Tabs,
  Table,
  type Column,
} from "./v2/ui";

type StatusFilter = "all" | OrderStatus;

const PIPELINE: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "completed"];
const KANBAN_COLUMNS: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "completed"];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

function nextStatus(current: OrderStatus): OrderStatus | null {
  const i = PIPELINE.indexOf(current);
  if (i < 0 || i >= PIPELINE.length - 1) return null;
  return PIPELINE[i + 1];
}

function nextLabel(current: OrderStatus): string {
  const n = nextStatus(current);
  if (!n) return "";
  return `Move to ${STATUS_LABEL[n]}`;
}

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

export function AdminOrders() {
  const { location } = useAdminLocation();
  const toast = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders${location ? `?location=${location}` : ""}`);
      if (res.ok) {
        const data: Order[] = await res.json();
        setOrders(data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [location]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
    const t = setInterval(fetchOrders, 30_000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  // Allow other pages (or the command palette) to deep-link to a specific
  // order via /admin/orders#ORDER_ID
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    if (orders.some((o) => o.id === hash)) setDetailId(hash);
  }, [orders]);

  const handleStatusChange = async (orderId: string, status: OrderStatus) => {
    setUpdating(orderId);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status }),
      });
      if (res.ok) {
        // Optimistic local update so UI feels instant
        setOrders((arr) => arr.map((o) => (o.id === orderId ? { ...o, status } : o)));
        toast.success("Order updated", `Status changed to ${STATUS_LABEL[status].toLowerCase()}.`);
      } else {
        toast.error("Update failed", "Could not change the order status.");
      }
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (orderId: string) => {
    const res = await fetch("/api/admin/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    if (res.ok) {
      setOrders((arr) => arr.filter((o) => o.id !== orderId));
      setDetailId((id) => (id === orderId ? null : id));
      toast.success("Order deleted", "The time slot capacity has been released.");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error("Delete failed", (data as { error?: string }).error || "Try again in a moment.");
    }
  };

  // --- Filtering ---
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      if (o.id.toLowerCase().includes(q)) return true;
      if (o.customerName.toLowerCase().includes(q)) return true;
      if (o.customerPhone.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [orders, statusFilter, query]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: orders.length,
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const selected = useMemo(() => orders.find((o) => o.id === detailId) ?? null, [orders, detailId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Orders</h1>
          <p className="v2-page-subtitle">
            Track every order from payment through fulfillment.
          </p>
        </div>
        <div className="v2-page-actions">
          <Tabs
            value={view}
            onChange={(v) => setView(v as "kanban" | "table")}
            tabs={[
              { value: "kanban", label: "Kanban", icon: <KanbanSquare className="h-3.5 w-3.5" /> },
              { value: "table", label: "Table", icon: <TableProperties className="h-3.5 w-3.5" /> },
            ]}
            variant="pill"
            ariaLabel="View mode"
          />
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "v2-spin" : ""}`} />}
            onClick={onRefresh}
            disabled={refreshing}
          >
            Refresh
          </Button>
        </div>
      </header>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by id, name, or phone…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search orders"
          />
        </div>
        <Tabs
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "pending", label: STATUS_LABEL.pending, count: counts.pending },
            { value: "confirmed", label: STATUS_LABEL.confirmed, count: counts.confirmed },
            { value: "preparing", label: STATUS_LABEL.preparing, count: counts.preparing },
            { value: "ready", label: STATUS_LABEL.ready, count: counts.ready },
            { value: "completed", label: STATUS_LABEL.completed, count: counts.completed },
            { value: "cancelled", label: STATUS_LABEL.cancelled, count: counts.cancelled },
          ]}
          variant="pill"
          ariaLabel="Status filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Package}
              title={orders.length === 0 ? "No orders yet" : "No matches"}
              description={
                orders.length === 0
                  ? "When a customer pays through Stripe, orders appear here."
                  : "Try clearing the search or selecting a different status."
              }
            />
          </CardBody>
        </Card>
      ) : view === "kanban" ? (
        <Kanban
          orders={filtered}
          onOpen={setDetailId}
          onAdvance={(o) => {
            const next = nextStatus(o.status);
            if (next) handleStatusChange(o.id, next);
          }}
          updating={updating}
        />
      ) : (
        <OrdersTable rows={filtered} onOpen={setDetailId} />
      )}

      <OrderDetail
        order={selected}
        onClose={() => setDetailId(null)}
        onStatusChange={handleStatusChange}
        onRequestDelete={(id) => setPendingDelete(id)}
        updating={updating}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await handleDelete(pendingDelete);
        }}
        title="Delete this order?"
        description="Permanently removes the order. The time slot capacity is released. This cannot be undone."
        confirmLabel="Delete order"
        destructive
      />
    </div>
  );
}

interface KanbanProps {
  orders: Order[];
  onOpen: (id: string) => void;
  onAdvance: (o: Order) => void;
  updating: string | null;
}

function Kanban({ orders, onOpen, onAdvance, updating }: KanbanProps) {
  const grouped = useMemo(() => {
    const m = new Map<OrderStatus, Order[]>();
    for (const s of KANBAN_COLUMNS) m.set(s, []);
    for (const o of orders) {
      if (m.has(o.status)) m.get(o.status)!.push(o);
    }
    // Sort within columns: oldest first for pipeline urgency (pending->confirmed->prep->ready), newest first for completed
    for (const [s, arr] of m) {
      arr.sort((a, b) => {
        if (s === "completed") return b.createdAt.localeCompare(a.createdAt);
        return a.createdAt.localeCompare(b.createdAt);
      });
    }
    return m;
  }, [orders]);

  return (
    <div className="v2-kanban">
      {KANBAN_COLUMNS.map((col) => {
        const list = grouped.get(col) || [];
        return (
          <div key={col} className="v2-kanban-col">
            <div className="v2-kanban-col-header">
              <Badge tone={ORDER_STATUS_TONE[col]} variant="soft" dot>
                {STATUS_LABEL[col]}
              </Badge>
              <span className="v2-kanban-col-count">{list.length}</span>
            </div>
            <div className="v2-kanban-col-body">
              {list.length === 0 && <div className="v2-kanban-col-empty">No orders</div>}
              {list.map((o) => (
                <KanbanCard
                  key={o.id}
                  order={o}
                  onOpen={() => onOpen(o.id)}
                  onAdvance={() => onAdvance(o)}
                  isUpdating={updating === o.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface KanbanCardProps {
  order: Order;
  onOpen: () => void;
  onAdvance: () => void;
  isUpdating: boolean;
}

function KanbanCard({ order, onOpen, onAdvance, isUpdating }: KanbanCardProps) {
  const canAdvance = nextStatus(order.status) !== null;
  return (
    <div className="v2-kanban-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="v2-kanban-card-top">
        <span className="v2-kanban-card-id mono">{order.id.slice(-6).toUpperCase()}</span>
        <span className="v2-kanban-card-time">{fmtAgo(order.createdAt)}</span>
      </div>
      <div className="v2-kanban-card-customer">{order.customerName || "Guest"}</div>
      <div className="v2-kanban-card-meta">
        <span>
          {order.fulfillmentType === "delivery" ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {order.fulfillmentType === "delivery" ? "Delivery" : "Takeout"}
        </span>
        <span>
          <Clock className="h-3 w-3" /> {order.slotTime}
        </span>
        <span className="v2-kanban-card-loc">
          <MapPin className="h-3 w-3" /> {order.locationSlug}
        </span>
      </div>
      <div className="v2-kanban-card-foot">
        <span className="v2-kanban-card-total tabular">{formatPrice(order.totalAmount)}</span>
        {canAdvance && (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onAdvance();
            }}
            disabled={isUpdating}
          >
            {nextLabel(order.status)}
          </Button>
        )}
      </div>
    </div>
  );
}

interface TableProps {
  rows: Order[];
  onOpen: (id: string) => void;
}

function OrdersTable({ rows, onOpen }: TableProps) {
  const cols: Column<Order>[] = [
    {
      key: "id",
      header: "Order",
      cell: (o) => <span className="mono">{o.id.slice(-6).toUpperCase()}</span>,
      sortValue: (o) => o.id,
      width: "110px",
    },
    {
      key: "customer",
      header: "Customer",
      cell: (o) => (
        <div className="v2-cell-stack">
          <span>{o.customerName || "Guest"}</span>
          <span className="v2-cell-sub">{o.customerPhone}</span>
        </div>
      ),
      sortValue: (o) => o.customerName,
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <Badge tone={ORDER_STATUS_TONE[o.status]} variant="soft" dot>
          {STATUS_LABEL[o.status]}
        </Badge>
      ),
      sortValue: (o) => o.status,
    },
    {
      key: "fulfillment",
      header: "Channel",
      cell: (o) => (
        <span className="v2-inline">
          {o.fulfillmentType === "delivery" ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {o.fulfillmentType === "delivery" ? "Delivery" : "Takeout"}
        </span>
      ),
      sortValue: (o) => o.fulfillmentType,
    },
    {
      key: "location",
      header: "Location",
      cell: (o) => (
        <Badge tone="neutral" variant="outline" icon={<MapPin className="h-3 w-3" />}>
          {o.locationSlug}
        </Badge>
      ),
      sortValue: (o) => o.locationSlug,
    },
    {
      key: "slot",
      header: "Slot",
      cell: (o) => (
        <div className="v2-cell-stack">
          <span>{formatSlotDate(o.slotDate)}</span>
          <span className="v2-cell-sub">{o.slotTime}</span>
        </div>
      ),
      sortValue: (o) => `${o.slotDate}T${o.slotTime}`,
    },
    {
      key: "items",
      header: "Items",
      align: "right",
      cell: (o) => o.items.reduce((acc, ci) => acc + ci.quantity, 0),
      sortValue: (o) => o.items.reduce((acc, ci) => acc + ci.quantity, 0),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (o) => formatPrice(o.totalAmount),
      sortValue: (o) => o.totalAmount,
    },
    {
      key: "age",
      header: "Age",
      align: "right",
      cell: (o) => <span className="v2-muted">{fmtAgo(o.createdAt)}</span>,
      sortValue: (o) => o.createdAt,
    },
  ];

  return (
    <Table
      rows={rows}
      columns={cols}
      rowKey={(o) => o.id}
      defaultSort={{ key: "age", dir: "asc" }}
      onRowClick={(o) => onOpen(o.id)}
    />
  );
}

interface DetailProps {
  order: Order | null;
  onClose: () => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onRequestDelete: (orderId: string) => void;
  updating: string | null;
}

function OrderDetail({ order, onClose, onStatusChange, onRequestDelete, updating }: DetailProps) {
  if (!order) {
    return <Dialog open={false} onClose={onClose} />;
  }

  const subtotal = order.items.reduce((acc, ci) => acc + ci.menuItem.price * ci.quantity, 0);
  const delta = order.totalAmount - subtotal;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="v2-detail-title">
          <span className="mono">{order.id}</span>
          <Badge tone={ORDER_STATUS_TONE[order.status]} variant="soft" dot>
            {STATUS_LABEL[order.status]}
          </Badge>
        </span>
      }
      description={`Placed ${fmtAgo(order.createdAt)} · ${order.locationSlug}`}
      footer={
        <>
          <Button
            variant="ghost"
            leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => onRequestDelete(order.id)}
          >
            Delete
          </Button>
          <div className="v2-detail-status-actions">
            {PIPELINE.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={order.status === s ? "primary" : "secondary"}
                disabled={updating === order.id}
                onClick={() => order.status !== s && onStatusChange(order.id, s)}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
            <Button
              size="sm"
              variant={order.status === "cancelled" ? "danger" : "ghost"}
              disabled={order.status === "cancelled" || updating === order.id}
              onClick={() => onStatusChange(order.id, "cancelled")}
            >
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <div className="v2-detail-grid">
        <Card padding="compact" bare>
          <div className="v2-detail-row">
            <User className="h-3.5 w-3.5 v2-muted" />
            <span className="v2-detail-key">Customer</span>
            <span>{order.customerName || "Guest"}</span>
          </div>
          <div className="v2-detail-row">
            <Phone className="h-3.5 w-3.5 v2-muted" />
            <span className="v2-detail-key">Phone</span>
            <span className="mono">{order.customerPhone}</span>
          </div>
          <div className="v2-detail-row">
            {order.fulfillmentType === "delivery" ? <Truck className="h-3.5 w-3.5 v2-muted" /> : <Package className="h-3.5 w-3.5 v2-muted" />}
            <span className="v2-detail-key">Channel</span>
            <span>{order.fulfillmentType === "delivery" ? "Delivery" : "Takeout"}</span>
          </div>
          <div className="v2-detail-row">
            <Clock className="h-3.5 w-3.5 v2-muted" />
            <span className="v2-detail-key">Slot</span>
            <span>{formatSlotDate(order.slotDate)} · {order.slotTime}</span>
          </div>
          {order.deliveryAddress && (
            <div className="v2-detail-row">
              <MapPin className="h-3.5 w-3.5 v2-muted" />
              <span className="v2-detail-key">Address</span>
              <span>{order.deliveryAddress}</span>
            </div>
          )}
          <div className="v2-detail-row">
            <Banknote className="h-3.5 w-3.5 v2-muted" />
            <span className="v2-detail-key">Paid at</span>
            <span>{order.paidAt ? new Date(order.paidAt).toLocaleString() : "—"}</span>
          </div>
          {order.specialInstructions && (
            <div className="v2-detail-row v2-detail-row-block">
              <span className="v2-detail-key">Notes</span>
              <span className="v2-detail-notes">{order.specialInstructions}</span>
            </div>
          )}
        </Card>

        <Card padding="none">
          <CardHeader title="Line items" />
          <CardBody>
            <ul className="v2-detail-items">
              {order.items.map((ci, i) => (
                <li key={`${ci.menuItem.id}-${i}`}>
                  <span className="v2-detail-item-qty">{ci.quantity}×</span>
                  <span className="v2-detail-item-name">{ci.menuItem.name}</span>
                  <span className="v2-detail-item-price mono">
                    {formatPrice(ci.menuItem.price * ci.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="v2-detail-totals">
              <div>
                <span className="v2-muted">Subtotal</span>
                <span className="mono">{formatPrice(subtotal)}</span>
              </div>
              {delta !== 0 && (
                <div>
                  <span className="v2-muted">{delta > 0 ? "Delivery / fees" : "Discount"}</span>
                  <span className="mono">{formatPrice(delta)}</span>
                </div>
              )}
              <div className="v2-detail-total">
                <span>Total</span>
                <span className="mono">{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </Dialog>
  );
}
