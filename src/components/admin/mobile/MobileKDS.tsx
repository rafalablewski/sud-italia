"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Flame,
  PauseCircle,
  PlayCircle,
  Timer,
} from "lucide-react";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import type { Order, OrderStatus, MenuCategory } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { useAdminLocation } from "../v2/LocationContext";
import { useToast } from "../v2/ui/Toast";
import {
  Chip,
  ChipStrip,
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  useOfflineQueue,
} from "../v2/mobile";
import { useActionTiming } from "../v2/mobile/useActionTiming";
import { haptic } from "../v2/mobile/haptics";
import { playKdsCue } from "../v2/mobile/kdsAudio";
import { CloudOff } from "lucide-react";

const LANES: { id: OrderStatus; label: string; tone: "warning" | "info" | "success" }[] = [
  { id: "confirmed", label: "New", tone: "warning" },
  { id: "preparing", label: "In progress", tone: "info" },
  { id: "ready", label: "Ready", tone: "success" },
];

const STATIONS: { id: MenuCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pizza", label: MENU_CATEGORY_LABELS.pizza },
  { id: "pasta", label: MENU_CATEGORY_LABELS.pasta },
  { id: "antipasti", label: MENU_CATEGORY_LABELS.antipasti },
  { id: "panini", label: MENU_CATEGORY_LABELS.panini },
  { id: "drinks", label: MENU_CATEGORY_LABELS.drinks },
  { id: "desserts", label: MENU_CATEGORY_LABELS.desserts },
];

function nextStatus(s: OrderStatus): OrderStatus | null {
  if (s === "confirmed") return "preparing";
  if (s === "preparing") return "ready";
  if (s === "ready") return "completed";
  return null;
}

function fmtClock(s: number): string {
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const r = abs % 60;
  const sign = s < 0 ? "-" : "";
  return `${sign}${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function elapsedSec(order: Order): number {
  const base = order.paidAt ? new Date(order.paidAt).getTime() : new Date(order.createdAt).getTime();
  return Math.max(0, Math.round((Date.now() - base) / 1000));
}

function remainingSec(order: Order): number | null {
  if (!order.estimatedReadyAt) return null;
  const target = new Date(order.estimatedReadyAt).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.round((target - Date.now()) / 1000);
}

function tone(order: Order): "neutral" | "warning" | "danger" {
  const r = remainingSec(order);
  const el = elapsedSec(order);
  if (order.status === "ready") return "neutral";
  if (r !== null) {
    if (r < 0) return "danger";
    if (r < 180) return "warning";
    return "neutral";
  }
  if (el > 900) return "danger";
  if (el > 600) return "warning";
  return "neutral";
}

/**
 * Mobile-native KDS. On phones, one lane is visible at a time — swipe
 * horizontally or use the segment control to switch. Each ticket has
 * a big bump button (44pt) at the bottom and a giant elapsed timer.
 * Tick is 1 second when foregrounded, 5 seconds when hidden.
 */
export function MobileKDS() {
  const { location } = useAdminLocation();
  const toast = useToast();
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lane, setLane] = useState<OrderStatus>("confirmed");
  const [station, setStation] = useState<MenuCategory | "all">("all");
  const [, forceTick] = useState(0);
  const lastIdsRef = useRef<Set<string>>(new Set());
  const overdueAnnouncedRef = useRef<Set<string>>(new Set());
  const readyAnnouncedRef = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // Offline queue — kitchens in basement walk-ins lose wifi briefly. Bump
  // events queue locally and replay on reconnect so the line keeps moving
  // without losing state.
  const offline = useOfflineQueue({ storageKey: "sud-admin-kds-queue" });
  const timing = useActionTiming();

  const { orders, refresh } = useAdminOrdersStream(location, { paused });

  // 1s timer for prep clocks; slows to 5s when hidden.
  useEffect(() => {
    if (paused) return;
    let interval = 1000;
    let handle: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      handle = setInterval(() => forceTick((t) => t + 1), interval);
    };
    const stop = () => {
      if (handle) clearInterval(handle);
      handle = null;
    };
    start();
    const onVis = () => {
      stop();
      interval = document.visibilityState === "visible" ? 1000 : 5000;
      start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [paused]);

  // Audio ping on new tickets — gated by user-gesture (the unmute toggle
  // is the gesture). We track previously-seen IDs and beep when a new
  // ticket arrives in the lane we're viewing.
  useEffect(() => {
    if (muted || paused) {
      lastIdsRef.current = new Set(orders.filter((o) => o.status === "confirmed").map((o) => o.id));
      return;
    }
    const currentIds = new Set(orders.filter((o) => o.status === "confirmed").map((o) => o.id));
    const newlyConfirmed = Array.from(currentIds).filter((id) => !lastIdsRef.current.has(id));
    if (newlyConfirmed.length > 0 && lastIdsRef.current.size > 0) {
      playKdsCue("newOrder");
      haptic("medium");
    }
    lastIdsRef.current = currentIds;
  }, [orders, muted, paused]);

  // Overdue + ready cues — fire once per ticket per state transition.
  useEffect(() => {
    if (muted || paused) return;
    for (const o of orders) {
      if (o.status === "preparing" || o.status === "confirmed") {
        const r = remainingSec(o);
        if (r !== null && r < 0 && !overdueAnnouncedRef.current.has(o.id)) {
          overdueAnnouncedRef.current.add(o.id);
          playKdsCue("overdue");
          haptic("warning");
        }
      }
      if (o.status === "ready" && !readyAnnouncedRef.current.has(o.id)) {
        readyAnnouncedRef.current.add(o.id);
        playKdsCue("ready");
      }
    }
    // Prune so memory doesn't grow unbounded across a long service.
    const currentIds = new Set(orders.map((o) => o.id));
    for (const id of overdueAnnouncedRef.current) {
      if (!currentIds.has(id)) overdueAnnouncedRef.current.delete(id);
    }
    for (const id of readyAnnouncedRef.current) {
      if (!currentIds.has(id)) readyAnnouncedRef.current.delete(id);
    }
    // The tick effect already forces a re-render every 1s, so this effect
    // re-runs and discovers newly-overdue tickets without a dedicated
    // interval.
  }, [orders, muted, paused]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => LANES.some((l) => l.id === o.status))
      .filter((o) => o.status === lane)
      .filter((o) => {
        if (station === "all") return true;
        return o.items.some((it) => it.menuItem.category === station);
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [orders, lane, station]);

  const advance = async (order: Order) => {
    const target = nextStatus(order.status);
    if (!target) return;
    setBusy(order.id);
    haptic("success");
    timing.start("kds.bump");
    try {
      const delivered = await offline.send("/api/admin/orders", {
        method: "PUT",
        body: JSON.stringify({ id: order.id, status: target }),
      });
      if (delivered) {
        toast.success(
          order.status === "ready"
            ? "Bumped"
            : target === "preparing"
              ? "Started prep"
              : "Marked ready",
        );
      } else {
        toast.warning("Saved offline", "Will sync when back online.");
      }
    } finally {
      timing.stop("kds.bump", { fromStatus: order.status, toStatus: target });
      setBusy(null);
    }
  };

  const laneCounts = useMemo(() => {
    const map = new Map<OrderStatus, number>();
    for (const l of LANES) map.set(l.id, orders.filter((o) => o.status === l.id).length);
    return map;
  }, [orders]);

  const currentLaneIdx = LANES.findIndex((l) => l.id === lane);

  return (
    <PullToRefresh onRefresh={() => refresh()} disabled={paused}>
    <MobilePage
      toolbar={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SegmentControl<OrderStatus>
            value={lane}
            onChange={(v) => setLane(v)}
            options={LANES.map((l) => ({
              value: l.id,
              label: `${l.label} (${laneCounts.get(l.id) ?? 0})`,
            }))}
            ariaLabel="KDS lane"
          />
          <ChipStrip ariaLabel="Station filter">
            {STATIONS.map((s) => (
              <Chip
                key={s.id}
                label={s.label}
                active={station === s.id}
                onClick={() => setStation(s.id)}
              />
            ))}
          </ChipStrip>
        </div>
      }
    >
      {(!offline.online || offline.pending > 0) && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: offline.online ? "var(--info-soft)" : "var(--warning-soft)",
            color: offline.online ? "var(--info)" : "var(--warning)",
            border: `1px solid ${
              offline.online
                ? "color-mix(in oklab, var(--info) 30%, transparent)"
                : "color-mix(in oklab, var(--warning) 30%, transparent)"
            }`,
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          <CloudOff className="h-4 w-4" aria-hidden />
          {offline.online
            ? `Syncing ${offline.pending} queued action${offline.pending === 1 ? "" : "s"}…`
            : `Offline · ${offline.pending} queued · syncs on reconnect`}
        </div>
      )}
      <PageHeader
        title="Kitchen"
        subtitle={`${filtered.length} ticket${filtered.length === 1 ? "" : "s"} • ${LANES[currentLaneIdx]?.label}`}
        actions={
          <div style={{ display: "inline-flex", gap: 4 }}>
            <button
              type="button"
              aria-label={muted ? "Unmute" : "Mute"}
              className="v2-m-icon-btn"
              onClick={() => setMuted((m) => !m)}
            >
              {muted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </button>
            <button
              type="button"
              aria-label={paused ? "Resume" : "Pause"}
              className={`v2-m-icon-btn ${paused ? "is-active" : ""}`}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <PlayCircle className="h-5 w-5" /> : <PauseCircle className="h-5 w-5" />}
            </button>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <div className="v2-m-empty">
          <Flame className="h-6 w-6" aria-hidden />
          <div className="v2-m-empty-title">No tickets</div>
          <div className="v2-m-empty-desc">
            {paused ? "Stream is paused. Resume to keep updating." : "All clear on this lane."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((o) => (
            <TicketCard
              key={o.id}
              order={o}
              onAdvance={() => advance(o)}
              busy={busy === o.id}
            />
          ))}
        </div>
      )}

      {/* Lane navigation arrows for low-attention swipe alternative. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          className="v2-m-btn v2-m-btn-ghost"
          onClick={() => setLane(LANES[Math.max(0, currentLaneIdx - 1)].id)}
          disabled={currentLaneIdx === 0}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Prev lane
        </button>
        <button
          type="button"
          className="v2-m-btn v2-m-btn-ghost"
          onClick={() =>
            setLane(LANES[Math.min(LANES.length - 1, currentLaneIdx + 1)].id)
          }
          disabled={currentLaneIdx === LANES.length - 1}
        >
          Next lane <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </MobilePage>
    </PullToRefresh>
  );
}

function TicketCard({
  order,
  onAdvance,
  busy,
}: {
  order: Order;
  onAdvance: () => void;
  busy: boolean;
}) {
  const elapsed = elapsedSec(order);
  const remaining = remainingSec(order);
  const sev = tone(order);
  const next = nextStatus(order.status);

  return (
    <article
      style={{
        background:
          sev === "danger"
            ? "color-mix(in oklab, var(--danger) 12%, var(--surface-1))"
            : sev === "warning"
              ? "color-mix(in oklab, var(--warning) 10%, var(--surface-1))"
              : "var(--surface-1)",
        border: `1px solid ${
          sev === "danger"
            ? "color-mix(in oklab, var(--danger) 40%, transparent)"
            : sev === "warning"
              ? "color-mix(in oklab, var(--warning) 35%, transparent)"
              : "var(--border)"
        }`,
        borderRadius: "var(--m-card-radius)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "var(--m-elev-1)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: 0.06 }}>
            #{order.id.slice(-6)}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {order.customerName}
          </div>
        </div>
        <div
          className="tabular"
          style={{
            fontSize: "var(--m-text-mega)",
            fontWeight: 700,
            letterSpacing: -0.04,
            lineHeight: 1,
            color: sev === "danger" ? "var(--danger)" : sev === "warning" ? "var(--warning)" : "var(--fg)",
          }}
        >
          {fmtClock(elapsed)}
        </div>
      </header>

      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {order.items.map((it, i) => (
          <li
            key={`${it.menuItem.id}-${i}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontSize: 15,
              fontWeight: 500,
              color: "var(--fg)",
            }}
          >
            <span
              className="tabular"
              style={{
                fontWeight: 700,
                color: "var(--brand)",
                minWidth: 26,
              }}
            >
              {it.quantity}×
            </span>
            <span style={{ flex: 1 }}>{it.menuItem.name}</span>
            {it.menuItem.category && (
              <span
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.06,
                  color: "var(--fg-subtle)",
                  whiteSpace: "nowrap",
                }}
              >
                {it.menuItem.category}
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.specialInstructions && (
        <div
          style={{
            padding: 8,
            borderRadius: 8,
            background: "var(--warning-soft)",
            color: "var(--warning)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ⚠ {order.specialInstructions}
        </div>
      )}

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
          paddingTop: 6,
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-muted)" }}>
          <Timer className="h-3.5 w-3.5" aria-hidden />
          {remaining !== null ? (
            <span className="tabular">
              {remaining < 0 ? "Overdue " : "Due in "}
              {fmtClock(Math.abs(remaining))}
            </span>
          ) : (
            <span>{order.fulfillmentType}</span>
          )}
        </div>
        {next && (
          <button
            type="button"
            disabled={busy}
            onClick={onAdvance}
            className="v2-m-btn v2-m-btn-primary"
            style={{ minWidth: 132 }}
          >
            {order.status === "confirmed" ? "Start prep" : order.status === "preparing" ? "Mark ready" : "Bump"}
          </button>
        )}
      </footer>
    </article>
  );
}
