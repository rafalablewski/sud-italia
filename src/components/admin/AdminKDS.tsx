"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import {
  Bell,
  BellOff,
  CheckCircle2,
  ChefHat,
  Clock,
  Flame,
  MapPin,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Timer,
  Truck,
  Package,
} from "lucide-react";
import type { Order, OrderStatus, MenuCategory } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Tabs } from "./v2/ui";

const ACTIVE_STATUSES: OrderStatus[] = ["confirmed", "preparing", "ready"];
const KDS_COLUMNS: { id: OrderStatus; label: string; tone: "warning" | "info" | "success" }[] = [
  { id: "confirmed", label: "New", tone: "warning" },
  { id: "preparing", label: "In progress", tone: "info" },
  { id: "ready", label: "Ready · Expo", tone: "success" },
];

const STATION_FILTERS: { id: MenuCategory | "all"; label: string }[] = [
  { id: "all", label: "All stations" },
  { id: "pizza", label: MENU_CATEGORY_LABELS.pizza },
  { id: "pasta", label: MENU_CATEGORY_LABELS.pasta },
  { id: "antipasti", label: MENU_CATEGORY_LABELS.antipasti },
  { id: "panini", label: MENU_CATEGORY_LABELS.panini },
  { id: "drinks", label: MENU_CATEGORY_LABELS.drinks },
  { id: "desserts", label: MENU_CATEGORY_LABELS.desserts },
];

function nextStatus(current: OrderStatus): OrderStatus | null {
  if (current === "confirmed") return "preparing";
  if (current === "preparing") return "ready";
  if (current === "ready") return "completed";
  return null;
}

function nextLabel(current: OrderStatus): string {
  if (current === "confirmed") return "Start prep";
  if (current === "preparing") return "Mark ready";
  if (current === "ready") return "Bump · Done";
  return "";
}

function totalPrepSeconds(order: Order): number {
  const base = order.paidAt ? new Date(order.paidAt).getTime() : new Date(order.createdAt).getTime();
  return Math.max(0, Math.round((Date.now() - base) / 1000));
}

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Returns severity tone for a prep timer. */
function prepTone(seconds: number, status: OrderStatus): "neutral" | "warning" | "danger" {
  if (status === "ready") return "neutral";
  const minutes = seconds / 60;
  if (minutes > 25) return "danger";
  if (minutes > 12) return "warning";
  return "neutral";
}

function ticketCategories(order: Order): MenuCategory[] {
  const set = new Set<MenuCategory>();
  for (const ci of order.items) set.add(ci.menuItem.category);
  return Array.from(set);
}

export function AdminKDS() {
  const { location } = useAdminLocation();
  const toast = useToast();

  const [station, setStation] = useState<MenuCategory | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Live order stream — SSE with REST fallback. Replaces the old 5 s polling
  // loop. We mirror the stream into a local copy so optimistic updates from
  // advance/recall feel instant; the next SSE frame reconciles either way.
  const { orders: streamedOrders, refresh } = useAdminOrdersStream(location, { paused });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOrders(streamedOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)));
    setLoading(false);
  }, [streamedOrders]);
  // Cooks bump tickets by mistake constantly. We keep the last 5 bumps in
  // memory so a "Recall" tray on the right side can put one back on the
  // expo column in a single click — within the 60 s window where this is
  // most useful. Older bumps quietly fall out of the list.
  const [bumpHistory, setBumpHistory] = useState<
    { orderId: string; label: string; bumpedAt: number }[]
  >([]);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Tick every second for live timers
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Audio chime on new ticket
  useEffect(() => {
    const known = knownIdsRef.current;
    const currentIds = new Set(orders.map((o) => o.id));
    if (known.size === 0) {
      knownIdsRef.current = currentIds;
      return;
    }
    let newOnes = 0;
    for (const id of currentIds) if (!known.has(id)) newOnes++;
    if (newOnes > 0 && soundOn) {
      audioRef.current?.play().catch(() => {});
    }
    knownIdsRef.current = currentIds;
  }, [orders, soundOn]);

  const visibleByStatus = useMemo(() => {
    const map = new Map<OrderStatus, Order[]>();
    for (const col of KDS_COLUMNS) map.set(col.id, []);
    for (const o of orders) {
      if (station !== "all" && !ticketCategories(o).includes(station)) continue;
      map.get(o.status)?.push(o);
    }
    // Oldest first to surface the most-urgent tickets at the top of each column
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.paidAt || a.createdAt).localeCompare(b.paidAt || b.createdAt));
    }
    return map;
  }, [orders, station]);

  const advance = async (o: Order) => {
    const next = nextStatus(o.status);
    if (!next) return;
    setUpdatingId(o.id);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: o.id, status: next }),
      });
      if (res.ok) {
        if (next === "completed") {
          toast.success("Order bumped", `${o.customerName || "Guest"} · ${o.id.slice(-6).toUpperCase()}`);
          setBumpHistory((arr) =>
            [
              {
                orderId: o.id,
                label: `${o.customerName || "Guest"} · ${o.id.slice(-6).toUpperCase()}`,
                bumpedAt: Date.now(),
              },
              ...arr.filter((e) => e.orderId !== o.id),
            ].slice(0, 5),
          );
          setOrders((arr) => arr.filter((x) => x.id !== o.id));
        } else {
          setOrders((arr) => arr.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
        }
      } else {
        toast.error("Could not advance", "Try refreshing the queue.");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const recall = async (orderId: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/recall`, {
        method: "POST",
      });
      if (res.ok) {
        const recalled: Order = await res.json();
        // Reinsert into the active list so it shows up on the expo column
        // again; the next polling tick would catch it anyway but this keeps
        // the UI feeling instant.
        setOrders((arr) => {
          const without = arr.filter((x) => x.id !== recalled.id);
          return ACTIVE_STATUSES.includes(recalled.status)
            ? [...without, recalled]
            : without;
        });
        setBumpHistory((arr) => arr.filter((e) => e.orderId !== orderId));
        toast.success("Order recalled", "Back on the expo column.");
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}));
        toast.error("Could not recall", data.error || "Try again in a moment.");
      }
    } catch {
      toast.error("Could not recall", "Network error. Try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Avoid the live timer recomputing this every second by keying off `now`.
  const aggregateMetrics = useMemo(() => {
    const all = orders;
    const inFlight = all.filter((o) => o.status !== "ready");
    const ready = all.filter((o) => o.status === "ready").length;
    let oldestSeconds = 0;
    let totalSeconds = 0;
    for (const o of inFlight) {
      const s = totalPrepSeconds(o);
      if (s > oldestSeconds) oldestSeconds = s;
      totalSeconds += s;
    }
    const avgSeconds = inFlight.length > 0 ? Math.round(totalSeconds / inFlight.length) : 0;
    return { active: inFlight.length, ready, oldestSeconds, avgSeconds };
    // Recompute when `now` ticks so timers stay live
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, now]);

  return (
    <div className="v2-page v2-kds-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Kitchen Display</h1>
          <p className="v2-page-subtitle">
            {location ? `${location.toUpperCase()} · ` : "All locations · "}
            Live tickets · streaming updates
          </p>
        </div>
        <div className="v2-page-actions">
          <Tabs
            value={station}
            onChange={(v) => setStation(v as MenuCategory | "all")}
            tabs={STATION_FILTERS.map((s) => ({ value: s.id, label: s.label }))}
            variant="pill"
            ariaLabel="Station filter"
          />
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={soundOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            onClick={() => setSoundOn((s) => !s)}
            title={soundOn ? "Mute new-ticket chime" : "Enable new-ticket chime"}
          >
            {soundOn ? "Sound on" : "Muted"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={refresh}
          >
            Refresh
          </Button>
        </div>
      </header>

      {bumpHistory.length > 0 && (
        <div
          role="region"
          aria-label="Recently bumped"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            margin: "0.5rem 0 0.25rem",
            borderRadius: "0.5rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--fg-muted)" }}>
            <RotateCcw className="h-3.5 w-3.5" style={{ display: "inline", marginRight: "0.375rem", verticalAlign: "-2px" }} />
            Just bumped:
          </span>
          {bumpHistory.map((entry) => (
            <Button
              key={entry.orderId}
              size="sm"
              variant="ghost"
              disabled={updatingId === entry.orderId}
              onClick={() => recall(entry.orderId)}
              title={`Recall ${entry.label} to the expo column`}
            >
              {entry.label} · Recall
            </Button>
          ))}
        </div>
      )}

      {/* Decorative quick-stats above the board */}
      <section className="v2-kds-stats">
        <Card padding="compact">
          <div className="v2-kds-stat">
            <ChefHat className="h-4 w-4 v2-muted" />
            <div>
              <div className="v2-kds-stat-value tabular">{aggregateMetrics.active}</div>
              <div className="v2-kds-stat-label">Active tickets</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <CheckCircle2 className="h-4 w-4 v2-muted" />
            <div>
              <div className="v2-kds-stat-value tabular">{aggregateMetrics.ready}</div>
              <div className="v2-kds-stat-label">Ready for pickup</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <Timer className="h-4 w-4 v2-muted" />
            <div>
              <div className="v2-kds-stat-value tabular">{fmtClock(aggregateMetrics.avgSeconds)}</div>
              <div className="v2-kds-stat-label">Average wait</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <Clock className="h-4 w-4 v2-muted" />
            <div>
              <div className="v2-kds-stat-value tabular">{fmtClock(aggregateMetrics.oldestSeconds)}</div>
              <div className="v2-kds-stat-label">Oldest in flight</div>
            </div>
          </div>
        </Card>
      </section>

      {loading ? (
        <div className="v2-page-loading">Loading queue…</div>
      ) : orders.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Flame}
              title="Kitchen is clear"
              description="No active tickets right now. New paid orders show up here within seconds."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="v2-kds-board">
          {KDS_COLUMNS.map((col) => {
            const tickets = visibleByStatus.get(col.id) || [];
            return (
              <div key={col.id} className={`v2-kds-col v2-kds-col-${col.tone}`}>
                <div className="v2-kds-col-header">
                  <Badge tone={col.tone} variant="solid">
                    {col.label}
                  </Badge>
                  <span className="v2-kds-col-count">{tickets.length}</span>
                </div>
                <div className="v2-kds-col-body">
                  {tickets.length === 0 ? (
                    <div className="v2-kds-col-empty">No tickets here.</div>
                  ) : (
                    tickets.map((o) => (
                      <Ticket
                        key={o.id}
                        order={o}
                        stationFilter={station}
                        onAdvance={() => advance(o)}
                        isUpdating={updatingId === o.id}
                        nowMs={now}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chime audio. Public-domain short bell — bundled in /public if available,
          otherwise falls back to a data: WAV so the file does not 404. */}
      <audio ref={audioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAGn/AAA7AGn/AAA7AGn/AAA7AGn/AAA7AA==" />
    </div>
  );
}

interface TicketProps {
  order: Order;
  stationFilter: MenuCategory | "all";
  onAdvance: () => void;
  isUpdating: boolean;
  nowMs: number;
}

function Ticket({ order, stationFilter, onAdvance, isUpdating, nowMs }: TicketProps) {
  // nowMs forces a recompute every tick
  void nowMs;
  const seconds = totalPrepSeconds(order);
  const tone = prepTone(seconds, order.status);
  const byCategory = new Map<MenuCategory, typeof order.items>();
  for (const ci of order.items) {
    const arr = byCategory.get(ci.menuItem.category) || [];
    arr.push(ci);
    byCategory.set(ci.menuItem.category, arr);
  }

  return (
    <div className={`v2-ticket v2-ticket-${tone}`}>
      <header className="v2-ticket-header">
        <span className="v2-ticket-id mono">{order.id.slice(-6).toUpperCase()}</span>
        <span className={`v2-ticket-timer v2-ticket-timer-${tone}`}>
          <Timer className="h-3 w-3" /> {fmtClock(seconds)}
        </span>
      </header>
      <div className="v2-ticket-meta">
        <span className="v2-ticket-customer">{order.customerName || "Guest"}</span>
        <span className="v2-ticket-channel">
          {order.fulfillmentType === "delivery" ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {order.fulfillmentType === "delivery" ? "Delivery" : "Takeout"}
          <span className="v2-ticket-loc">
            <MapPin className="h-3 w-3" /> {order.locationSlug}
          </span>
        </span>
      </div>

      <div className="v2-ticket-stations">
        {Array.from(byCategory.entries()).map(([cat, items]) => {
          const dim = stationFilter !== "all" && stationFilter !== cat;
          return (
            <div key={cat} className={`v2-ticket-station ${dim ? "is-dim" : ""}`}>
              <div className="v2-ticket-station-label">{MENU_CATEGORY_LABELS[cat]}</div>
              <ul>
                {items.map((ci, i) => (
                  <li key={`${ci.menuItem.id}-${i}`} style={{ flexWrap: "wrap" }}>
                    <span className="v2-ticket-qty">{ci.quantity}×</span>
                    <span className="v2-ticket-name">{ci.menuItem.name}</span>
                    {ci.notes && (
                      <span
                        className="v2-ticket-item-note"
                        style={{
                          width: "100%",
                          marginLeft: "1.5rem",
                          marginTop: "0.125rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "var(--danger)",
                          letterSpacing: "0.01em",
                        }}
                      >
                        ⚠ {ci.notes}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {order.specialInstructions && (
        <div className="v2-ticket-notes">
          <span className="v2-ticket-notes-label">Order notes</span>
          <span>{order.specialInstructions}</span>
        </div>
      )}

      <footer className="v2-ticket-foot">
        <span className="v2-ticket-slot">
          <Clock className="h-3 w-3" /> Pickup {order.slotTime}
        </span>
        <Button size="sm" variant={order.status === "ready" ? "success" : "primary"} onClick={onAdvance} disabled={isUpdating}>
          {nextLabel(order.status)}
        </Button>
      </footer>
    </div>
  );
}
