"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import {
  AlertTriangle,
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
  Users,
  Package,
} from "lucide-react";
import type { Order, OrderStatus, MenuCategory } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import dynamic from "next/dynamic";
import { useAdminLocation } from "./v2/LocationContext";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";
import { Badge, Button, Card, CardBody, EmptyState, Select, Tabs } from "./v2/ui";
import { AdminKdsFleet } from "./AdminKdsFleet";
import type { AdminRole } from "@/lib/admin-roles";

const MobileKDS = dynamic(
  () => import("./mobile/MobileKDS").then((m) => m.MobileKDS),
  { ssr: false },
);

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

/**
 * Seconds remaining until the order's promised-ready timestamp. Returns
 * null when the order has no SLA (legacy rows before the m2_5 migration,
 * or orders fired without a recipe-driven promise). Negative values
 * mean the order is overdue.
 */
function remainingSlaSeconds(order: Order): number | null {
  if (!order.estimatedReadyAt) return null;
  const target = new Date(order.estimatedReadyAt).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.round((target - Date.now()) / 1000);
}

function fmtClock(s: number): string {
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const r = abs % 60;
  const sign = s < 0 ? "-" : "";
  return `${sign}${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/**
 * Severity tone for a ticket. When the order has a promised-ready SLA
 * we drive the colour off remaining-vs-target (audit §3 — KDS was
 * surfacing elapsed-only, which lets a 5-minute order look as urgent
 * as a 25-minute order). Fall back to elapsed for legacy rows.
 */
function prepTone(
  elapsedSeconds: number,
  remainingSeconds: number | null,
  status: OrderStatus,
): "neutral" | "warning" | "danger" {
  if (status === "ready") return "neutral";
  if (remainingSeconds !== null) {
    if (remainingSeconds < 0) return "danger";
    if (remainingSeconds < 180) return "warning";
    return "neutral";
  }
  const minutes = elapsedSeconds / 60;
  if (minutes > 25) return "danger";
  if (minutes > 12) return "warning";
  return "neutral";
}

function ticketCategories(order: Order): MenuCategory[] {
  const set = new Set<MenuCategory>();
  for (const ci of order.items) set.add(ci.menuItem.category);
  return Array.from(set);
}

const KDS_MODE_KEY = "sud-kds-mode";

/**
 * Role-aware KDS shell. One live-order engine, three lenses:
 *   • owner   → Fleet command (cross-truck health) by default, with a
 *               switcher down into any truck's floor board.
 *   • manager → Floor board (single location).
 *   • kitchen/staff → Floor board (the line view they've always had).
 * Mobile keeps the dedicated MobileKDS regardless of role.
 */
export function AdminKDS() {
  const { isMobile, ready } = useIsMobile();
  const { setLocation } = useAdminLocation();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [mode, setMode] = useState<"fleet" | "floor">("floor");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const r = j?.role as AdminRole | undefined;
        if (!r) return;
        setRole(r);
        if (r === "owner") {
          let initial: "fleet" | "floor" = "fleet";
          try {
            const saved = localStorage.getItem(KDS_MODE_KEY);
            if (saved === "fleet" || saved === "floor") initial = saved;
          } catch {
            /* storage may be blocked */
          }
          setMode(initial);
        }
      })
      .catch(() => {
        /* non-fatal — falls back to the floor board */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseMode = useCallback((m: "fleet" | "floor") => {
    setMode(m);
    try {
      localStorage.setItem(KDS_MODE_KEY, m);
    } catch {
      /* non-fatal */
    }
  }, []);

  if (ready && isMobile) {
    return <MobileKDS />;
  }

  // Managers + franchisees get the floor-control ops header; kitchen/staff
  // get the chef line strip (station focus + queue depth + quick 86); the
  // pre-resolve null state gets the plain board.
  const managerControls = role === "manager" || role === "franchisee";
  const chef = role === "kitchen" || role === "staff";

  // Only owners get the Fleet ↔ Floor switcher.
  if (role !== "owner") {
    return <AdminKDSDesktop opsHeader={managerControls} chefStrip={chef} />;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: "16px 20px 0" }}>
        <Button
          variant={mode === "fleet" ? "primary" : "ghost"}
          size="sm"
          leadingIcon={<Truck className="h-3.5 w-3.5" />}
          onClick={() => chooseMode("fleet")}
        >
          Fleet
        </Button>
        <Button
          variant={mode === "floor" ? "primary" : "ghost"}
          size="sm"
          leadingIcon={<ChefHat className="h-3.5 w-3.5" />}
          onClick={() => chooseMode("floor")}
        >
          Floor board
        </Button>
      </div>
      {mode === "fleet" ? (
        <AdminKdsFleet
          onDrillIn={(slug) => {
            setLocation(slug);
            chooseMode("floor");
          }}
        />
      ) : (
        // An owner dropping into a truck gets the manager floor controls too.
        <AdminKDSDesktop opsHeader />
      )}
    </div>
  );
}

const KDS_STATION_KEY = "sud-kds-station";

function AdminKDSDesktop({ opsHeader = false, chefStrip = false }: { opsHeader?: boolean; chefStrip?: boolean }) {
  const { location } = useAdminLocation();
  const toast = useToast();

  const [station, setStation] = useState<MenuCategory | "all">("all");

  // Remember the cook's station across reloads — a line cook works one
  // station all shift and shouldn't re-pick it every refresh.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KDS_STATION_KEY);
      if (saved && STATION_FILTERS.some((s) => s.id === saved)) {
        setStation(saved as MenuCategory | "all");
      }
    } catch {
      /* storage may be blocked */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KDS_STATION_KEY, station);
    } catch {
      /* non-fatal */
    }
  }, [station]);
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
  const overdueFiredRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const overdueAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Audio chime on SLA breach — once per ticket. The first time a
  // ticket crosses 0 seconds remaining we play a more urgent chime,
  // then remember the id so we don't loop. The set is cleared if the
  // ticket leaves the active list (bumped/recalled both work).
  useEffect(() => {
    const fired = overdueFiredRef.current;
    const stillActive = new Set(orders.map((o) => o.id));
    for (const id of Array.from(fired)) {
      if (!stillActive.has(id)) fired.delete(id);
    }
    if (!soundOn) return;
    for (const o of orders) {
      if (o.status === "ready") continue;
      const remaining = remainingSlaSeconds(o);
      if (remaining === null || remaining >= 0) continue;
      if (fired.has(o.id)) continue;
      fired.add(o.id);
      overdueAudioRef.current?.play().catch(() => {});
    }
    // `now` keeps this effect ticking each second so the cross-zero
    // moment fires the chime even if the underlying orders array
    // hasn't changed.
  }, [orders, soundOn, now]);

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

  // Bump-bar hotkeys (audit §3 — "button-click only" was costing ~3s
  // per bump at rush). Number keys 1-9 advance the corresponding
  // ticket in the leftmost column with tickets (the "next action"
  // column). 0 advances the 10th. Plain digit only — no modifier —
  // matching how commercial bump-bars wire to a USB number pad.
  // Ignored while an input/textarea is focused so admins can still
  // type into search boxes etc.
  const ticketColumnFlat = useMemo(() => {
    for (const col of KDS_COLUMNS) {
      const arr = visibleByStatus.get(col.id) || [];
      if (arr.length > 0) return arr;
    }
    return [] as Order[];
  }, [visibleByStatus]);
  const orderById = useMemo(() => {
    const m = new Map<string, Order>();
    for (const o of orders) m.set(o.id, o);
    return m;
  }, [orders]);

  // Keyboard handler — kept stable so the listener attaches once.
  // advanceRef points at the latest `advance` closure so the hotkey
  // always uses fresh state (orders, updatingId).
  const advanceRef = useRef<(o: Order) => Promise<void>>(async () => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      let index = -1;
      if (e.key >= "1" && e.key <= "9") index = parseInt(e.key, 10) - 1;
      else if (e.key === "0") index = 9;
      if (index < 0) return;
      const ticket = ticketColumnFlat[index];
      if (!ticket) return;
      e.preventDefault();
      void advanceRef.current(ticket);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticketColumnFlat]);
  void orderById;

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

  // Keep the hotkey ref pointing at the latest closure so it always
  // resolves to the current state when the cook taps a number key.
  useEffect(() => {
    advanceRef.current = advance;
  });

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

      {opsHeader && <KdsManagerOpsHeader orders={orders} location={location} />}

      {chefStrip && <KdsChefStrip orders={orders} station={station} location={location} />}

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
      {/* Second, more attention-grabbing chime fired once per ticket
          when it crosses the promised-ready deadline. Same data-URI
          fallback so deployment doesn't depend on shipping an mp3. */}
      <audio ref={overdueAudioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAJL/AABuAJL/AABuAJL/AABuAJL/AABuAA==" />
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
  const remaining = remainingSlaSeconds(order);
  const tone = prepTone(seconds, remaining, order.status);
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
          {remaining !== null && order.status !== "ready" && (
            <span
              title="Time remaining to promised-ready"
              style={{
                marginLeft: "0.4rem",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              · {remaining < 0 ? "LATE " : "T-"}
              {fmtClock(Math.abs(remaining))}
            </span>
          )}
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

interface FloorOps {
  locationSlug: string;
  menuSlug: string;
  throughputLastHour: number;
  onShift: number;
  menu: { id: string; name: string; category: string; available: boolean }[];
}

/**
 * Manager floor-control header. Sits above the board for managers /
 * franchisees (and owners drilled into a truck). Reuses the active orders
 * the board already streams to surface live open / late / soon / oldest /
 * average-age signals, and pulls throughput + on-shift staff + the menu
 * availability list from /api/admin/kds/floor-ops so the manager can read
 * the floor and 86 / restore items without leaving the board.
 */
function KdsManagerOpsHeader({ orders, location }: { orders: Order[]; location: string }) {
  const toast = useToast();
  const [ops, setOps] = useState<FloorOps | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    try {
      const res = await fetch(`/api/admin/kds/floor-ops${qs}`);
      if (res.ok) setOps((await res.json()) as FloorOps);
    } catch {
      /* non-fatal */
    }
  }, [location]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const setAvailability = useCallback(
    async (id: string, available: boolean) => {
      setBusyId(id);
      try {
        const res = await fetch("/api/admin/menu", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, available }),
        });
        if (!res.ok) {
          toast.error("Could not update availability");
          return;
        }
        toast.success(available ? "Item restored" : "Item 86'd");
        await load();
      } finally {
        setBusyId(null);
        setPick("");
      }
    },
    [load, toast],
  );

  // Live SLA roll-up from the active orders the board holds.
  let late = 0;
  let soon = 0;
  let oldest = 0;
  let ageSum = 0;
  for (const o of orders) {
    const age = totalPrepSeconds(o);
    ageSum += age;
    if (age > oldest) oldest = age;
    if (o.status === "ready") continue;
    const rem = remainingSlaSeconds(o);
    if (rem !== null && rem < 0) late++;
    else if (rem !== null && rem < 180) soon++;
  }
  const avg = orders.length > 0 ? Math.round(ageSum / orders.length) : 0;

  const eightySixed = (ops?.menu ?? []).filter((m) => !m.available);
  const availableItems = (ops?.menu ?? []).filter((m) => m.available);

  return (
    <Card padding="compact" className="v2-kds-ops">
      <CardBody>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
          <OpsStat icon={<ChefHat className="h-4 w-4 v2-muted" />} value={String(orders.length)} label="Open" />
          <OpsStat icon={<Flame className="h-4 w-4" style={{ color: late > 0 ? "rgb(220,38,38)" : undefined }} />} value={String(late)} label="Late" tone={late > 0 ? "danger" : undefined} />
          <OpsStat icon={<AlertTriangle className="h-4 w-4" style={{ color: soon > 0 ? "rgb(217,119,6)" : undefined }} />} value={String(soon)} label="Due soon" tone={soon > 0 ? "warning" : undefined} />
          <OpsStat icon={<Timer className="h-4 w-4 v2-muted" />} value={orders.length > 0 ? fmtClock(oldest) : "—"} label="Oldest" />
          <OpsStat icon={<Clock className="h-4 w-4 v2-muted" />} value={orders.length > 0 ? fmtClock(avg) : "—"} label="Avg age" />
          <OpsStat icon={<CheckCircle2 className="h-4 w-4 v2-muted" />} value={ops ? String(ops.throughputLastHour) : "…"} label="Done · last hr" />
          <OpsStat icon={<Users className="h-4 w-4 v2-muted" />} value={ops ? String(ops.onShift) : "…"} label="On shift" />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>86&apos;d:</span>
          {eightySixed.length === 0 ? (
            <span className="v2-muted" style={{ fontSize: 13 }}>nothing — full menu available</span>
          ) : (
            eightySixed.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="ghost"
                disabled={busyId === m.id}
                onClick={() => setAvailability(m.id, true)}
                title={`Restore ${m.name}`}
              >
                <Badge tone="danger" variant="soft">{m.name}</Badge>
                <span style={{ marginLeft: 6 }}>Restore</span>
              </Button>
            ))
          )}
          <div style={{ minWidth: 220, marginLeft: "auto" }}>
            <Select
              aria-label="86 an item"
              value={pick}
              placeholder="86 an item…"
              onChange={(e) => { if (e.target.value) void setAvailability(e.target.value, false); }}
              options={availableItems.map((m) => ({ value: m.id, label: m.name }))}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function OpsStat({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "rgb(220,38,38)" : tone === "warning" ? "rgb(217,119,6)" : undefined;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {icon}
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span className="tabular" style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
        <span className="v2-muted" style={{ fontSize: 11 }}>{label}</span>
      </span>
    </span>
  );
}

/**
 * Chef line strip. Shown to kitchen / staff on the board. Surfaces the
 * cook's focused-station queue depth (how many tickets hit their station and
 * how old the oldest is) and a quick 86 control: declare an item you've run
 * out of (options are the items actually on the active tickets, so it's one
 * tap mid-cook) and restore items that are currently 86'd. Uses the
 * kitchen-permitted /api/admin/kds/eighty-six endpoint.
 */
function KdsChefStrip({
  orders,
  station,
  location,
}: {
  orders: Order[];
  station: MenuCategory | "all";
  location: string;
}) {
  const toast = useToast();
  const [eightySixed, setEightySixed] = useState<{ id: string; name: string }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    try {
      const res = await fetch(`/api/admin/kds/eighty-six${qs}`);
      if (res.ok) setEightySixed((await res.json()).eightySixed ?? []);
    } catch {
      /* non-fatal */
    }
  }, [location]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const toggle = useCallback(
    async (id: string, available: boolean) => {
      setBusyId(id);
      try {
        const qs = location ? `?location=${encodeURIComponent(location)}` : "";
        const res = await fetch(`/api/admin/kds/eighty-six${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, available }),
        });
        if (!res.ok) {
          toast.error("Could not update availability");
          return;
        }
        toast.success(available ? "Item restored" : "Item 86'd");
        await load();
      } finally {
        setBusyId(null);
        setPick("");
      }
    },
    [load, location, toast],
  );

  // Focused-station queue depth from the active tickets.
  const focused = orders.filter((o) => station === "all" || ticketCategories(o).includes(station as MenuCategory));
  let oldest = 0;
  for (const o of focused) {
    const age = totalPrepSeconds(o);
    if (age > oldest) oldest = age;
  }
  const stationLabel = STATION_FILTERS.find((s) => s.id === station)?.label ?? "All stations";

  // Items currently on the active tickets (optionally narrowed to the
  // focused station) — the chef's one-tap 86 candidates.
  const candidates = new Map<string, string>();
  for (const o of orders) {
    for (const ci of o.items) {
      if (station !== "all" && ci.menuItem.category !== station) continue;
      if (!eightySixed.some((e) => e.id === ci.menuItem.id)) {
        candidates.set(ci.menuItem.id, ci.menuItem.name);
      }
    }
  }

  return (
    <Card padding="compact" className="v2-kds-chef">
      <CardBody>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <ChefHat className="h-4 w-4 v2-muted" />
            <span style={{ fontWeight: 600 }}>{stationLabel}</span>
          </span>
          {station === "all" ? (
            <span className="v2-muted" style={{ fontSize: 13 }}>Pick your station above to focus your queue.</span>
          ) : (
            <>
              <OpsStat icon={<Flame className="h-4 w-4 v2-muted" />} value={String(focused.length)} label="In your queue" />
              <OpsStat icon={<Timer className="h-4 w-4 v2-muted" />} value={focused.length > 0 ? fmtClock(oldest) : "—"} label="Oldest" />
            </>
          )}
          <div style={{ minWidth: 200, marginLeft: "auto" }}>
            <Select
              aria-label="86 an item you've run out of"
              value={pick}
              placeholder="Out of an item? 86 it…"
              onChange={(e) => { if (e.target.value) void toggle(e.target.value, false); }}
              options={[...candidates.entries()].map(([id, name]) => ({ value: id, label: name }))}
            />
          </div>
        </div>
        {eightySixed.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>86&apos;d:</span>
            {eightySixed.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="ghost"
                disabled={busyId === m.id}
                onClick={() => toggle(m.id, true)}
                title={`Restore ${m.name}`}
              >
                <Badge tone="danger" variant="soft">{m.name}</Badge>
                <span style={{ marginLeft: 6 }}>Restore</span>
              </Button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
