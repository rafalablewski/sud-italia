"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, CloudOff, PauseCircle, PlayCircle } from "lucide-react";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import { useKdsSimulator } from "@/lib/useKdsSimulator";
import type { Order, OrderStatus } from "@/data/types";
import { analyzeTruck } from "@/lib/kds-prediction";
import { buildKdsTicket } from "@/lib/kds-ticket";
import { KdsTicketCard } from "../kds/KdsTicketCard";
import { SegControl } from "../command";
import { toneForTicket } from "../kds-board";
import { useAdminLocation } from "../v2/LocationContext";
import { useToast } from "../v2/ui/Toast";
import { PullToRefresh, useOfflineQueue } from "../v2/mobile";
import { useActionTiming } from "../v2/mobile/useActionTiming";
import { haptic } from "../v2/mobile/haptics";
import { playKdsCue } from "../v2/mobile/kdsAudio";

const LANES: { id: OrderStatus; label: string; tone: "warning" | "info" | "success" }[] = [
  { id: "confirmed", label: "New", tone: "warning" },
  { id: "preparing", label: "In progress", tone: "info" },
  { id: "ready", label: "Ready", tone: "success" },
];

function nextStatus(s: OrderStatus): OrderStatus | null {
  if (s === "confirmed") return "preparing";
  if (s === "preparing") return "ready";
  if (s === "ready") return "completed";
  return null;
}

function remainingSec(order: Order): number | null {
  if (!order.estimatedReadyAt) return null;
  const target = new Date(order.estimatedReadyAt).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.round((target - Date.now()) / 1000);
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
  const { enabled: simEnabled } = useKdsSimulator(location);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lane, setLane] = useState<OrderStatus>("confirmed");
  const [now, setNow] = useState(() => Date.now());
  const lastIdsRef = useRef<Set<string>>(new Set());
  const overdueAnnouncedRef = useRef<Set<string>>(new Set());
  const readyAnnouncedRef = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // Offline queue — kitchens in basement walk-ins lose wifi briefly. Bump
  // events queue locally and replay on reconnect so the line keeps moving
  // without losing state.
  const offline = useOfflineQueue({ storageKey: "sud-admin-kds-queue" });
  const timing = useActionTiming();

  const { orders, refresh } = useAdminOrdersStream(location, { paused, includeSimulated: true });

  // 1s timer for prep clocks; slows to 5s when hidden.
  useEffect(() => {
    if (paused) return;
    let interval = 1000;
    let handle: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      handle = setInterval(() => setNow(Date.now()), interval);
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
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [orders, lane]);

  // Shared KDS tickets for the visible lane, built off the predictive engine
  // (the same analyzeTruck the Atlas fleet board runs) so the cards + tones
  // match Fleet exactly.
  const filteredTickets = useMemo(() => {
    const analysis = analyzeTruck(orders, now);
    return filtered.map((o) => buildKdsTicket(o, analysis.predictions.get(o.id), now));
  }, [filtered, orders, now]);

  const advance = async (order: { id: string; status: OrderStatus }) => {
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

  return (
    <PullToRefresh onRefresh={() => refresh()} disabled={paused}>
      {/* Atlas chrome — the mobile floor board matches the fleet board exactly:
          same dark panel and lane switcher, only the lanes differ. */}
      <div className="kds-atlas kds-floor-dark">
        <header className="cmd-head">
          <div className="cmd-brand">
            <span className="cmd-wordmark">SUD ITALIA</span>
            <span className="cmd-label">{location ? `${location} · floor` : "Floor"}</span>
            {simEnabled && <span className="ka-sandbox">Sandbox</span>}
          </div>
          <SegControl
            ariaLabel="Stage focus"
            value={lane}
            onChange={setLane}
            options={LANES.map((l) => ({
              value: l.id,
              label: l.label,
              count: laneCounts.get(l.id) ?? 0,
              dataLine: l.id === "ready" ? "ready" : l.id === "preparing" ? "prep" : "new",
            }))}
          />
          <div className="cmd-spacer" />
          <button
            type="button"
            className="cmd-btn"
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={!muted}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="cmd-btn"
            aria-label={paused ? "Resume" : "Pause"}
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
          </button>
        </header>

        {(!offline.online || offline.pending > 0) && (
          <div className="ka-recall" role="status">
            <span className="ka-recall-lab">
              <CloudOff className="h-3.5 w-3.5" />
              {offline.online
                ? `Syncing ${offline.pending} queued action${offline.pending === 1 ? "" : "s"}…`
                : `Offline · ${offline.pending} queued · syncs on reconnect`}
            </span>
          </div>
        )}

        <div className="ka-floor-body">
          {filtered.length === 0 ? (
            <div className="ka-empty">
              {paused ? "Stream is paused — resume to keep updating." : "All clear on this lane."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredTickets.map((t) => (
                <KdsTicketCard
                  key={t.id}
                  t={t}
                  now={now}
                  tone={toneForTicket(t, now)}
                  station="all"
                  advancing={busy === t.id}
                  onAdvance={advance}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
