"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocation } from "@/shared/LocationContext";
import { CoreShell } from "@/core/shell/CoreShell";
import { RefreshIcon, ExpandIcon, SoundIcon, PauseIcon } from "@/core/shell/toolIcons";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import { idempotentFetch } from "@/lib/idempotentFetch";
import { analyzeTruck } from "@/lib/kds-prediction";
import { buildKdsTicket, type KdsTicket, type KdsTicketItem } from "@/lib/kds-ticket";
import { useSelection, type CoreSelection } from "@/core/shell/SelectionContext";
import { POS_COURSE_LABELS, POS_COURSE_ORDER, defaultCourseForCategory } from "@/lib/pos-coursing";
import {
  KDS_COLUMNS,
  STATION_FILTERS,
  fmtClock,
  groupTicketsByColumn,
  nextStatus,
  prevStatus,
  toneForTicket,
} from "@/core/kds/kds-board";
import { KDS_STATION_LABELS, type MenuCategory, type OrderStatus, type PosCourse } from "@/data/types";

type View = "fleet" | "floor" | "chef";

const BUMP_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "Start firing",
  preparing: "Mark ready",
  ready: "Bump to pass",
};

// Canonical station order for grouping a multi-station ticket's lines.
const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
function catRank(c: string): number {
  const i = CATEGORY_ORDER.indexOf(c);
  return i < 0 ? 99 : i;
}
function groupItems(items: KdsTicketItem[]): [string, KdsTicketItem[]][] {
  const groups = new Map<string, KdsTicketItem[]>();
  for (const it of items) {
    const arr = groups.get(it.category) ?? [];
    arr.push(it);
    groups.set(it.category, arr);
  }
  return [...groups.entries()]
    .sort((a, b) => catRank(a[0]) - catRank(b[0]))
    .map(([cat, arr]) => [KDS_STATION_LABELS[cat as MenuCategory] ?? arr[0].categoryLabel, arr] as [string, KdsTicketItem[]]);
}

// Short synthesised beep (no asset files) — the new-ticket bell + breach alarm.
// One shared AudioContext, lazily created + resumed; a fresh context per beep
// quickly hits the browser's hardware-context cap (~6) and then fails silently.
let sharedAudioCtx: AudioContext | null = null;
function playTone(freq: number, dur: number, gain = 0.2): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    sharedAudioCtx ??= new Ctx();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch {
    /* audio blocked — no-op */
  }
}

function channelTag(t: KdsTicket): string {
  if (t.fulfillmentType === "dine-in") return `Dine-in${t.partySize ? ` · ${t.partySize}p` : ""}`;
  if (t.fulfillmentType === "delivery") return "Delivery";
  return "Takeaway";
}

// Cook-time meter fill (0% fresh → 100% due), ported from the live KDS.
function slaPct(t: KdsTicket, now: number): number {
  if (t.status === "ready") return 100;
  const slaRem = t.promisedReadyAtMs !== null ? (t.promisedReadyAtMs - now) / 1000 : null;
  if (slaRem !== null && slaRem < 0) return 100;
  if (slaRem !== null && t.promisedReadyAtMs !== null) {
    const window = Math.max(60, (t.promisedReadyAtMs - t.paidAtMs) / 1000);
    return Math.min(100, Math.max(0, Math.round((1 - slaRem / window) * 100)));
  }
  const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
  const predRem = Math.max(0, (t.predictedReadyAtMs - now) / 1000);
  return Math.min(95, Math.round((elapsed / Math.max(60, predRem + elapsed)) * 100));
}

function dueLabel(t: KdsTicket, now: number): { text: string; tone: string } {
  const tone = toneForTicket(t, now);
  if (t.status === "ready") return { text: "done", tone };
  const slaRem = t.promisedReadyAtMs !== null ? (t.promisedReadyAtMs - now) / 1000 : null;
  if (slaRem !== null && slaRem < 0) return { text: `−${fmtClock(-slaRem)}`, tone };
  if (slaRem !== null) return { text: fmtClock(slaRem), tone };
  return { text: fmtClock(Math.max(0, (t.predictedReadyAtMs - now) / 1000)), tone };
}

/**
 * Shared 1-second kitchen clock. A single module-level interval fans a tick out
 * to every subscribed leaf via useSyncExternalStore — so the per-second elapsed
 * / countdown updates re-render only the small <TicketCard> timer nodes, never
 * the whole board. The expensive board work (analyzeTruck + buildKdsTicket +
 * grouping) is driven off the parent's *coarse* clock instead (see KDS_COARSE_MS),
 * which is what made the 1 s tick lag the fleet / floor / chef views.
 */
let clockNow = Date.now();
const clockSubs = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
function subscribeClock(cb: () => void): () => void {
  clockSubs.add(cb);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const f of clockSubs) f();
    }, 1000);
  }
  return () => {
    clockSubs.delete(cb);
    if (clockSubs.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
function useKitchenClock(): number {
  return useSyncExternalStore(subscribeClock, () => clockNow, () => clockNow);
}

/** Parent recompute cadence for the heavy ticket pipeline + KPI aggregates.
 *  Card countdowns stay 1 s-smooth via useKitchenClock; predictions / risk /
 *  late / age tiles refreshing every few seconds is imperceptible. */
const KDS_COARSE_MS = 5000;

/**
 * One kitchen ticket. Memoised so it only re-renders when its own ticket data
 * changes or the shared clock ticks — and the structural parts (item grouping,
 * allergen dedupe) are memoised on the items, so a clock tick costs just the
 * countdown/meter math, not a re-group of every card.
 */
const TicketCard = memo(function TicketCard({
  t,
  station,
  updating,
  focused,
  onAdvance,
  onRegress,
  onPick,
}: {
  t: KdsTicket;
  station: MenuCategory | "all";
  updating: boolean;
  /** True when this ticket's table is the cross-lens selected entity. */
  focused?: boolean;
  onAdvance: (t: KdsTicket) => void;
  /** Long-press = step the ticket back one status (destructive recall). */
  onRegress?: (t: KdsTicket) => void;
  /** Pin this ticket to the persistent Context Dock (stable setter from the
   *  board's single useSelection() — keeps memoised tickets from re-rendering). */
  onPick?: (s: CoreSelection) => void;
}) {
  const now = useKitchenClock();
  const due = dueLabel(t, now);
  const pct = slaPct(t, now);
  const atRisk = t.atRisk && t.status !== "ready";
  const groups = useMemo(() => groupItems(t.items), [t.items]);
  const allergens = useMemo(
    () => Array.from(new Set(t.items.flatMap((i) => i.allergens))).filter(Boolean),
    [t.items],
  );
  const grouped = station === "all" && groups.length > 1;
  const held = t.coursing?.held ?? [];
  const next = nextStatus(t.status);
  const canRecall = !!onRegress && !!prevStatus(t.status);

  // Whole card = bump; long-press = recall a step. The line has one wet hand:
  // the entire card is the target, and a deliberate hold undoes a mis-bump.
  const lp = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const cancelPress = () => {
    if (lp.current.timer) { clearTimeout(lp.current.timer); lp.current.timer = null; }
  };
  const startPress = () => {
    if (t.simulated || !canRecall) return;
    lp.current.fired = false;
    lp.current.timer = setTimeout(() => { lp.current.fired = true; onRegress!(t); }, 550);
  };
  const onCardClick = () => {
    if (lp.current.fired) { lp.current.fired = false; return; } // long-press already fired
    if (t.simulated || !next) return;
    onAdvance(t);
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div
      className={`core-tk t-${due.tone}${t.simulated ? " sim" : ""}${focused ? " is-focus" : ""}${next && !t.simulated ? " bumpable" : ""}`}
      onClick={onCardClick}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      title={next && !t.simulated ? `Tap to ${BUMP_LABEL[t.status]}${canRecall ? " · hold to recall" : ""}` : undefined}
    >
      <div
        className="core-tk-h"
        onPointerDown={stop}
        onClick={(e) => {
          stop(e);
          if (t.simulated) return;
          onPick?.({
            kind: "order",
            id: t.id,
            label: `#${t.shortId}`,
            sub: `${channelTag(t)}${t.partySize ? ` · ${t.partySize} covers` : ""} · ${t.itemCount} item${t.itemCount === 1 ? "" : "s"}`,
            status: t.status === "ready" ? "Ready" : t.status === "preparing" ? "Preparing" : t.status.charAt(0).toUpperCase() + t.status.slice(1),
            statusCls: t.status === "ready" ? "available" : atRisk ? "freeing" : "booked",
            note: t.specialInstructions || undefined,
            href: "/core/kds",
            items: t.items.slice(0, 24).map((i) => ({ label: i.name, qty: i.quantity, note: i.notes })),
          });
        }}
        style={{ cursor: "pointer" }}
        title="Pin to the check dock"
      >
        <span className="id">
          #{t.shortId}
          <span className="chiplet">{channelTag(t)}</span>
        </span>
        <span className="core-tk-hend">
          {atRisk && <span className="core-tk-risk">At risk</span>}
          <span className={`due t-${due.tone}`}>{due.text}</span>
        </span>
      </div>
      {t.simulated && <div className="core-tk-sim">Simulation — not a real order</div>}
      {held.length > 0 && (
        <div className="core-tk-course held">⊘ {held.map((c) => POS_COURSE_LABELS[c]).join(" · ")} held</div>
      )}
      <div className="core-tk-items">
        {groups.map(([label, items]) => (
          <div key={label} className="core-tk-grp-block">
            {grouped && <div className="core-tk-grp">{label}</div>}
            {items.map((it, i) => {
              const dim = station !== "all" && it.category !== station;
              return (
                <div key={i} className={dim ? "it dim" : "it"}>
                  <span className="q">{it.quantity}×</span>
                  <div className="it-body">
                    <div className="nm">{it.name}</div>
                    {it.modifiers.map((m, mi) => (
                      <div key={mi} className={m.flag ? "mod flag" : "mod"}>{m.label}</div>
                    ))}
                    {it.notes && <div className="mod">{it.notes}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {allergens.length > 0 && <div className="core-tk-alrg">Allergens · {allergens.join(" · ")}</div>}
      {t.specialInstructions && (
        <div className="core-tk-note">
          <b>Note</b> {t.specialInstructions}
        </div>
      )}
      <div className="core-meter">
        <i style={{ width: `${pct}%` }} className={`t-${due.tone}`} />
      </div>
      {next && (
        <button type="button" className="core-bump" disabled={updating} onPointerDown={stop} onClick={(e) => { stop(e); onAdvance(t); }}>
          {BUMP_LABEL[t.status]}
        </button>
      )}
    </div>
  );
});

/**
 * Core · KDS — the always-dark kitchen wall, wired to the live order stream.
 * Floor (New → Firing → Ready·Expo lanes) + Chef (station make-queue) run off
 * the same engine as today's /core/kds: useAdminOrdersStream → analyzeTruck →
 * buildKdsTicket → groupTicketsByColumn, bump via PUT /api/admin/orders. Fleet
 * pulls /api/admin/kds/fleet (owner). The wall stays dark regardless of theme.
 */
export function CoreKds() {
  const { location, setLocation } = useLocation();
  const toast = useCoreToast();
  // Single context read for the whole board — the stable `select` setter is
  // passed to each memoised TicketCard, so pinning a ticket to the Context Dock
  // never re-renders the other tickets.
  const { select, selected } = useSelection();
  const [view, setView] = useState<View>("floor");
  const [station, setStation] = useState<MenuCategory | "all">("all");
  const [lane, setLane] = useState<OrderStatus | "all">("all");
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [showAllDay, setShowAllDay] = useState(false);
  const [eightySixOpen, setEightySixOpen] = useState(false);
  const [recalls, setRecalls] = useState<{ orderId: string; label: string; at: number }[]>([]);
  // Fleet: which kitchen the Atlas is scoped to (all → every truck), and a
  // manual-refresh nonce so the toolbar ⟳ re-pulls the feed on demand.
  const [fleetLoc, setFleetLoc] = useState<string>("all");
  const [fleetNonce, setFleetNonce] = useState(0);
  // Chef view focus: the expo pass (all-day + coursing) or all-day full-width.
  const [chefFocus, setChefFocus] = useState<"expo" | "allday">("expo");

  const { orders, refresh, patchOrder } = useAdminOrdersStream(location, { paused, includeSimulated: true });

  // Coarse tick: drives the heavy ticket pipeline + KPI aggregates only. The
  // per-second countdowns live in <TicketCard> via the shared kitchen clock, so
  // this no longer re-runs analyzeTruck/buildKdsTicket for the whole board every
  // second (the cause of the fleet/floor/chef lag).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), KDS_COARSE_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.role) return;
        setRole(j.role);
        // Owners land on the cross-truck Atlas (Fleet) by default; the line
        // roles stay on their board.
        if (j.role === "owner") setView("fleet");
      })
      .catch(() => {});
  }, []);

  const visibleByStatus = useMemo(() => {
    const analysis = analyzeTruck(orders, now);
    const tickets = orders.map((o) => buildKdsTicket(o, analysis.predictions.get(o.id), now));
    return groupTicketsByColumn(tickets, station, now);
  }, [orders, station, now]);

  const allTickets = useMemo(() => KDS_COLUMNS.flatMap((c) => visibleByStatus.get(c.id) ?? []), [visibleByStatus]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTickets.length };
    for (const col of KDS_COLUMNS) c[col.id] = (visibleByStatus.get(col.id) ?? []).length;
    c.risk = allTickets.filter((t) => t.atRisk && t.status !== "ready").length;
    c.late = allTickets.filter((t) => t.promisedReadyAtMs !== null && t.promisedReadyAtMs < now && t.status !== "ready").length;
    return c;
  }, [visibleByStatus, allTickets, now]);

  // Pressure-adaptive density (real signal, not a toggle): when the line tips
  // to risk the board compacts — cards drop descriptions/notes, targets stay
  // 44px, more tickets fit the wall. Derived from live at-risk/late counts.
  const pressureTier: "calm" | "warn" | "risk" =
    counts.late > 0 || counts.risk >= 3 ? "risk" : counts.risk >= 1 ? "warn" : "calm";

  // "All-day" — the batch the line cooks from: every still-to-make item (New +
  // Firing, not yet Ready) summed by dish across active tickets, biggest first.
  // Derived live from the same tickets (Rule #1, no mock data); respects the
  // station filter via `allTickets`.
  const allDay = useMemo(() => {
    const agg = new Map<string, { name: string; category: string; qty: number; tickets: number }>();
    for (const t of allTickets) {
      if (t.status === "ready") continue;
      for (const it of t.items) {
        const cur = agg.get(it.name) ?? { name: it.name, category: it.categoryLabel, qty: 0, tickets: 0 };
        cur.qty += it.quantity;
        cur.tickets += 1;
        agg.set(it.name, cur);
      }
    }
    return [...agg.values()].sort((a, b) => b.qty - a.qty);
  }, [allTickets]);

  const advance = useCallback(
    async (t: KdsTicket) => {
      const next = nextStatus(t.status);
      if (!next || updatingId) return;
      setUpdatingId(t.id);
      // Move the ticket instantly and pin it there until the server echoes the
      // new status — otherwise a stream frame computed before the write commits
      // snaps it back to the old column for a few seconds.
      patchOrder(t.id, { status: next });
      try {
        // Retries transient failures so a WiFi blip doesn't strand the ticket;
        // a status bump is naturally idempotent, so a retry is always safe.
        const { res } = await idempotentFetch(`/api/admin/orders`, {
          method: "PUT",
          body: { orderId: t.id, status: next },
        });
        if (!res || !res.ok) {
          const d = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
          // Roll the optimistic move back to the real status on failure.
          patchOrder(t.id, { status: t.status });
          toast(d.error || (res ? "Could not bump ticket" : "No connection — ticket not bumped"), "danger");
          return;
        }
        // A bump to "completed" can be recalled within 10 min (mis-tap insurance).
        if (next === "completed") {
          setRecalls((r) => [{ orderId: t.id, label: `#${t.shortId}`, at: Date.now() }, ...r].slice(0, 5));
        }
        refresh();
      } finally {
        setUpdatingId(null);
      }
    },
    [updatingId, refresh, toast, patchOrder],
  );

  // Long-press on a card steps it BACK one status — the on-card destructive
  // "recall" (ready→firing, firing→new). Optimistic + rolls back on failure,
  // same idempotent PUT the bump uses.
  const regress = useCallback(
    async (t: KdsTicket) => {
      const prev = prevStatus(t.status);
      if (!prev || updatingId) return;
      setUpdatingId(t.id);
      patchOrder(t.id, { status: prev });
      try {
        const { res } = await idempotentFetch(`/api/admin/orders`, {
          method: "PUT",
          body: { orderId: t.id, status: prev },
        });
        if (!res || !res.ok) {
          patchOrder(t.id, { status: t.status });
          toast(res ? "Could not recall ticket" : "No connection — ticket not recalled", "danger");
          return;
        }
        toast(`#${t.shortId} recalled to ${prev === "confirmed" ? "New" : "Firing"}`, "success");
        refresh();
      } finally {
        setUpdatingId(null);
      }
    },
    [updatingId, refresh, toast, patchOrder],
  );

  // Recall the last bump (completed → ready), the mis-tap undo.
  const recall = useCallback(
    async (orderId: string) => {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/recall`, { method: "POST" });
      if (res.ok) {
        // Recall un-completes a ticket (completed → ready); pin it so the stream
        // can't briefly re-show it as done.
        patchOrder(orderId, { status: "ready" });
        setRecalls((r) => r.filter((x) => x.orderId !== orderId));
        toast("Ticket recalled to Expo", "success");
        refresh();
      } else toast("Could not recall", "danger");
    },
    [refresh, toast, patchOrder],
  );
  // Expire recall entries after 10 min.
  useEffect(() => {
    if (recalls.length === 0) return;
    const id = setInterval(() => setRecalls((r) => r.filter((x) => Date.now() - x.at < 10 * 60 * 1000)), 30000);
    return () => clearInterval(id);
  }, [recalls.length]);
  // Persist the recall tray per location so a tablet refresh keeps its undo
  // window (the recall API only works for ~10 min after the bump anyway).
  const recallKey = location ? `core-kds-recall:${location}` : null;
  useEffect(() => {
    if (!recallKey) return;
    try {
      const raw = localStorage.getItem(recallKey);
      const saved = raw ? (JSON.parse(raw) as { orderId: string; label: string; at: number }[]) : [];
      setRecalls(saved.filter((x) => Date.now() - x.at < 10 * 60 * 1000));
    } catch {
      setRecalls([]);
    }
  }, [recallKey]);
  useEffect(() => {
    if (!recallKey) return;
    try {
      localStorage.setItem(recallKey, JSON.stringify(recalls));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [recallKey, recalls]);

  const toggleKiosk = useCallback(() => {
    setKiosk((k) => {
      const next = !k;
      if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      return next;
    });
  }, []);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setKiosk(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const stationsPresent = useMemo(() => {
    const present = new Set<MenuCategory>();
    for (const t of allTickets) for (const it of t.items) present.add(it.category);
    return STATION_FILTERS.filter((s) => s.id === "all" || present.has(s.id as MenuCategory));
  }, [allTickets]);

  // ----- Fleet -----
  const [fleet, setFleet] = useState<FleetWire | null>(null);
  useEffect(() => {
    if (view !== "fleet") return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/kds/fleet?includeSimulated=1");
        if (!res.ok) return;
        const data = (await res.json()) as FleetWire;
        if (!cancelled) setFleet(data);
      } catch {
        /* non-fatal */
      }
    };
    void load();
    const id = setInterval(load, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [view, fleetNonce]);

  // Fleet-wide all-day — every still-to-make dish summed across the scoped
  // trucks' live tickets (respects the kitchen filter). Same batch view as the
  // floor's Σ rail, aggregated cross-truck from the feed (Rule #1, no mock data).
  const fleetAllDay = useMemo(() => {
    if (!fleet) return [] as { name: string; qty: number; tickets: number }[];
    const agg = new Map<string, { name: string; qty: number; tickets: number }>();
    for (const t of fleet.tiles) {
      if (fleetLoc !== "all" && t.slug !== fleetLoc) continue;
      for (const tk of t.tickets) {
        if (tk.status === "ready") continue;
        for (const it of tk.items) {
          const cur = agg.get(it.name) ?? { name: it.name, qty: 0, tickets: 0 };
          cur.qty += it.quantity;
          cur.tickets += 1;
          agg.set(it.name, cur);
        }
      }
    }
    return [...agg.values()].sort((a, b) => b.qty - a.qty);
  }, [fleet, fleetLoc]);

  // ----- Manager ops metrics (throughput + on-shift, the live floor-ops feed)
  type StationLoad = { id: MenuCategory; util: number; tier: "calm" | "warn" | "risk"; demand: number };
  const [ops, setOps] = useState<{ throughputLastHour: number; coversHr: number; revenueHr: number; onShift: number; stations: StationLoad[] } | null>(null);
  useEffect(() => {
    if (view === "fleet" || !location) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/admin/kds/floor-ops?location=${encodeURIComponent(location)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setOps({ throughputLastHour: d.throughputLastHour ?? 0, coversHr: d.coversHr ?? 0, revenueHr: d.revenueHr ?? 0, onShift: d.onShift ?? 0, stations: Array.isArray(d.stations) ? d.stations : [] });
      } catch {
        /* non-fatal — manager-only endpoint; the band just shows — */
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [view, location]);

  // ----- Chef view — all-day-by-station + expo coursing, all live (Rule #1) -----
  // All-day, grouped by station (canonical order): still-to-make dishes per
  // category, with the station's live load from floor-ops.
  const allDayByStation = useMemo(() => {
    const byCat = new Map<MenuCategory, { name: string; qty: number }[]>();
    for (const t of allTickets) {
      if (t.status === "ready") continue;
      for (const it of t.items) {
        const arr = byCat.get(it.category) ?? [];
        const ex = arr.find((x) => x.name === it.name);
        if (ex) ex.qty += it.quantity;
        else arr.push({ name: it.name, qty: it.quantity });
        byCat.set(it.category, arr);
      }
    }
    return [...byCat.entries()]
      .sort((a, b) => catRank(a[0]) - catRank(b[0]))
      .map(([cat, items]) => {
        const ld = ops?.stations.find((x) => x.id === cat);
        const sorted = [...items].sort((a, b) => b.qty - a.qty);
        return {
          cat,
          label: KDS_STATION_LABELS[cat],
          load: ld ? ld.util : null,
          tier: ld?.tier ?? ("calm" as "calm" | "warn" | "risk"),
          max: Math.max(...sorted.map((i) => i.qty), 1),
          items: sorted,
        };
      });
  }, [allTickets, ops]);

  // Expo pass — each active check as a coursing spine. Course node status is
  // derived from the real POS coursing (fired / held) + the order stage.
  const expoChecks = useMemo(() => {
    return [...allTickets]
      .sort(
        (a, b) =>
          (TONE_RANK[toneForTicket(b, now)] ?? 0) - (TONE_RANK[toneForTicket(a, now)] ?? 0) ||
          a.paidAtMs - b.paidAtMs,
      )
      .map((t) => {
        const present = new Set(t.items.map((it) => defaultCourseForCategory(it.category)));
        const held = new Set(t.coursing?.held ?? []);
        const fired = new Set(t.coursing?.fired ?? []);
        const nodes = POS_COURSE_ORDER.filter((c) => present.has(c)).map((c) => {
          let st: "done" | "firing" | "wait";
          if (t.status === "ready") st = "done";
          else if (held.has(c)) st = "wait";
          else if (t.status === "preparing" && (fired.size === 0 || fired.has(c))) st = "firing";
          else st = "wait";
          return { course: c, label: POS_COURSE_LABELS[c], st };
        });
        return { t, nodes };
      });
  }, [allTickets, now]);

  // Chef stat strip — all live: on the pass (ready), checks awaiting a held
  // course, longest hold age, total all-day items, in-progress, allergy flags.
  const chefStats = useMemo(() => {
    const holds = allTickets.filter((t) => (t.coursing?.held?.length ?? 0) > 0);
    const holdAges = holds.filter((t) => t.status !== "ready").map((t) => Math.max(0, (now - t.paidAtMs) / 1000));
    return {
      onPass: counts.ready,
      awaiting: holds.length,
      longestHold: holdAges.length ? Math.max(...holdAges) : 0,
      allDayItems: allDay.reduce((s, d) => s + d.qty, 0),
      inProgress: counts.preparing,
      allergy: allTickets.filter((t) => t.items.some((it) => it.allergens.length > 0)).length,
    };
  }, [allTickets, counts.ready, counts.preparing, allDay, now]);

  // Number-key bump (1–9, 0=10th) on the focused lane, or the leftmost
  // non-empty lane — the commercial bump-bar wiring. Ignored while typing.
  const bumpList = useMemo(() => {
    if (lane !== "all") return visibleByStatus.get(lane) ?? [];
    for (const c of KDS_COLUMNS) {
      const a = visibleByStatus.get(c.id) ?? [];
      if (a.length) return a;
    }
    return [] as KdsTicket[];
  }, [visibleByStatus, lane]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const d = e.key === "0" ? 10 : /^[1-9]$/.test(e.key) ? parseInt(e.key, 10) : 0;
      if (!d) return;
      const t = bumpList[d - 1];
      if (t) {
        e.preventDefault();
        void advance(t);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bumpList, advance]);

  // Two opt-in chimes (off by default — the line opts in): a bright bell when
  // a new ticket lands, and a lower alarm the instant a ticket breaches SLA.
  const prevNew = useRef(0);
  useEffect(() => {
    const n = counts.confirmed ?? 0;
    if (soundOn && n > prevNew.current) playTone(880, 0.25);
    prevNew.current = n;
  }, [counts.confirmed, soundOn]);

  // SLA-breach alarm — fires once per ticket as it crosses the promised time.
  // Already-late tickets are seeded silently so toggling sound on (or a refresh)
  // never triggers a back-catalogue of alarms; only fresh breaches sound.
  const breached = useRef<Set<string>>(new Set());
  const breachSeeded = useRef(false);
  useEffect(() => {
    const present = new Set<string>();
    for (const t of allTickets) {
      present.add(t.id);
      const late = t.status !== "ready" && t.promisedReadyAtMs !== null && t.promisedReadyAtMs < now;
      if (late && !breached.current.has(t.id)) {
        breached.current.add(t.id);
        // Seed already-late tickets silently on the first populated pass so a
        // refresh (or sound toggled on) never replays a back-catalogue of alarms.
        if (soundOn && breachSeeded.current) playTone(320, 0.4, 0.22);
      }
    }
    for (const id of breached.current) if (!present.has(id)) breached.current.delete(id);
    if (allTickets.length > 0) breachSeeded.current = true;
  }, [allTickets, now, soundOn]);

  const isOwner = role === "owner";
  const tabs = [
    ...(isOwner ? [{ label: "Fleet", active: view === "fleet", onClick: () => setView("fleet") }] : []),
    { label: "Floor", active: view === "floor", onClick: () => setView("floor") },
    { label: "Chef", active: view === "chef", onClick: () => setView("chef") },
  ];

  // Cross-lens focus: a table selected on any lens (Floor/dock) pulses its
  // ticket here. Computed per-card so the memoised TicketCard only re-renders
  // the cards whose focus actually flipped.
  const focusTableId = selected?.kind === "table" ? selected.id : null;
  const renderTicket = (t: KdsTicket) => (
    <TicketCard
      key={t.id}
      t={t}
      station={station}
      updating={updatingId === t.id}
      focused={!!focusTableId && t.tableId === focusTableId}
      onAdvance={advance}
      onRegress={regress}
      onPick={select}
    />
  );

  // The board's own controls. Per the "Command" mockup the KDS command bar
  // carries NO surface tools (just the prompt + Fleet/Floor/Chef tabs), so the
  // lane filter + action buttons live on the board itself — as a toolbar row
  // in-shell, and inline in the fullscreen kiosk top strip.
  const laneFilter =
    view === "fleet" ? null : (
      <div className="core-seg">
        <button className={lane === "all" ? "on" : ""} onClick={() => setLane("all")}>
          All <b>{counts.all}</b>
        </button>
        {KDS_COLUMNS.map((c) => (
          <button key={c.id} className={lane === c.id ? "on" : ""} onClick={() => setLane(c.id)}>
            {c.label.split(" ")[0]} <b>{counts[c.id]}</b>
          </button>
        ))}
      </div>
    );
  const boardActions =
    view === "fleet" ? null : (
      <>
        {recalls.length > 0 && (
          <button
            type="button"
            className="core-iconbtn core-recall-btn"
            title={`Undo last bump — restores ${recalls[0].label}`}
            onClick={() => void recall(recalls[0].orderId)}
          >
            ↩ Undo{recalls.length > 1 ? ` · ${recalls.length}` : ""}
          </button>
        )}
        <button
          type="button"
          className={showAllDay ? "core-tpill on" : "core-tpill"}
          title="All-day — batch counts per dish"
          aria-pressed={showAllDay}
          onClick={() => setShowAllDay((v) => !v)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h6" /></svg>
          Σ all-day
        </button>
        <button type="button" className="core-iconbtn" title="Refresh now" aria-label="Refresh now" onClick={() => refresh()}><RefreshIcon /></button>
        <button type="button" className="core-tpill danger" title="86 an item" onClick={() => setEightySixOpen(true)}>86</button>
        <button type="button" className={soundOn ? "core-iconbtn on" : "core-iconbtn"} title={soundOn ? "Mute" : "Chime on new ticket"} aria-label={soundOn ? "Mute chime" : "Chime on new ticket"} onClick={() => setSoundOn((s) => !s)}>
          <SoundIcon muted={!soundOn} />
        </button>
        <button type="button" className="core-iconbtn" title={paused ? "Resume" : "Pause"} aria-label={paused ? "Resume auto-refresh" : "Pause auto-refresh"} onClick={() => setPaused((p) => !p)}>
          <PauseIcon paused={paused} />
        </button>
      </>
    );
  // Fleet toolbar — the Atlas carries a kitchen filter (All · per-truck) plus the
  // same board actions the mockup keeps out of the command bar: Σ fleet all-day,
  // refresh, 86, chime. Fullscreen-enter is added by the in-shell wrapper only.
  // Live 86'd count for the toolbar badge, scoped to the kitchen filter.
  const fleetEightySix = (fleet?.tiles ?? [])
    .filter((t) => fleetLoc === "all" || t.slug === fleetLoc)
    .reduce((s, t) => s + t.eightySix, 0);
  const fleetControls =
    view !== "fleet" ? null : (
      <>
        <div className="core-seg">
          <button className={fleetLoc === "all" ? "on" : ""} onClick={() => setFleetLoc("all")}>
            All kitchens
          </button>
          {(fleet?.tiles ?? []).map((t) => (
            <button key={t.slug} className={fleetLoc === t.slug ? "on" : ""} onClick={() => setFleetLoc(t.slug)}>
              {t.city}
            </button>
          ))}
        </div>
        <div className="core-kds-tb-sp" />
        <button
          type="button"
          className={showAllDay ? "core-tpill on" : "core-tpill"}
          title="Fleet all-day — batch counts per dish"
          aria-pressed={showAllDay}
          onClick={() => setShowAllDay((v) => !v)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h6" /></svg>
          Σ fleet all-day
        </button>
        <button type="button" className="core-iconbtn" title="Refresh fleet now" aria-label="Refresh fleet" onClick={() => setFleetNonce((n) => n + 1)}><RefreshIcon /></button>
        <button type="button" className="core-tpill danger" title="86 an item" onClick={() => setEightySixOpen(true)}>
          86{fleetEightySix > 0 ? ` · ${fleetEightySix}` : ""}
        </button>
        <button type="button" className={soundOn ? "core-iconbtn on" : "core-iconbtn"} title={soundOn ? "Mute" : "Chime on new ticket"} aria-label={soundOn ? "Mute chime" : "Chime on new ticket"} onClick={() => setSoundOn((s) => !s)}>
          <SoundIcon muted={!soundOn} />
        </button>
      </>
    );

  // Kiosk top keeps them inline (no fullscreen-enter button there — the top
  // strip has its own Exit control).
  const controls =
    view === "fleet" ? (
      fleetControls
    ) : (
      <>
        {laneFilter}
        {boardActions}
      </>
    );

  // 86 is per-kitchen: in Fleet, scope it to the selected truck (or the active
  // location when viewing all kitchens); the boards use the current location.
  const eightySixLoc = view === "fleet" && fleetLoc !== "all" ? fleetLoc : location || "";
  const overlays = (
    <EightySix location={eightySixLoc} open={eightySixOpen} onClose={() => setEightySixOpen(false)} />
  );

  // The live station strip (present stations, each a one-tap filter that also
  // shows its predictive load) — shared by Floor + Chef.
  const stationStrip = (
    <div className="core-stations">
      {stationsPresent.map((s) => {
        const ld = s.id === "all" ? null : ops?.stations.find((x) => x.id === s.id);
        const tone = ld ? (ld.tier === "risk" ? "var(--danger)" : ld.tier === "warn" ? "var(--amber)" : "var(--basil)") : null;
        return (
          <button
            key={s.id}
            type="button"
            className={station === s.id ? "core-stn on" : "core-stn"}
            onClick={() => setStation(s.id)}
          >
            {tone && <span className="core-stn-dot" style={{ background: tone }} />}
            {s.id === "all" ? "All stations" : KDS_STATION_LABELS[s.id as MenuCategory]}
            {ld && (
              <>
                <span className="core-stn-load"><i style={{ width: `${Math.min(100, ld.util)}%`, background: tone! }} /></span>
                <span className="core-stn-pct">{ld.util}%</span>
              </>
            )}
          </button>
        );
      })}
      <span className="core-stn core-stn-expo" aria-hidden><span className="core-stn-dot" style={{ background: "var(--basil)" }} />Expo<b>{counts.ready}</b></span>
    </div>
  );

  // All-day batch rail (New + Firing, biggest first) — shared by Floor + Chef,
  // toggled by the Σ control; live from the active tickets (Rule #1).
  const allDayRail = showAllDay ? (
    <div className="core-allday" role="list" aria-label="All-day batch counts">
      <span className="core-allday-lbl">All-day</span>
      {allDay.length === 0 ? (
        <span className="core-allday-empty">Nothing on the line.</span>
      ) : (
        allDay.map((d) => (
          <span key={d.name} className="core-allday-item" role="listitem" title={`${d.qty}× ${d.name} across ${d.tickets} ticket${d.tickets === 1 ? "" : "s"}`}>
            <b className="n">{d.qty}</b>
            <span className="nm">{d.name}</span>
            <span className="tk">·{d.tickets}</span>
          </span>
        ))
      )}
    </div>
  ) : null;

  const board = (
    <div className={`core-kds${view !== "fleet" && pressureTier === "risk" ? " dense" : ""}`}>
        {view === "fleet" ? (
          <>
            <div className="core-kds-toolbar">
              {fleetControls}
              <button type="button" className="core-iconbtn" title="Fullscreen kiosk" aria-label="Fullscreen kiosk" onClick={toggleKiosk}><ExpandIcon /></button>
            </div>
            <div className="core-crumb">
              CORE — KDS · FLEET · <b>liquid glass</b> · <span className="fix">all kitchens · one pass</span>
            </div>
            <div className="core-sectionhead">
              <h1>KDS · Fleet — All kitchens</h1>
              <span className="sub">kraków + warszawa · live pass health</span>
            </div>
            {showAllDay && (
              <div className="core-allday" role="list" aria-label="Fleet all-day batch counts">
                <span className="core-allday-lbl">All-day</span>
                {fleetAllDay.length === 0 ? (
                  <span className="core-allday-empty">Nothing on the line.</span>
                ) : (
                  fleetAllDay.map((d) => (
                    <span key={d.name} className="core-allday-item" role="listitem" title={`${d.qty}× ${d.name} across ${d.tickets} ticket${d.tickets === 1 ? "" : "s"}`}>
                      <b className="n">{d.qty}</b>
                      <span className="nm">{d.name}</span>
                      <span className="tk">·{d.tickets}</span>
                    </span>
                  ))
                )}
              </div>
            )}
            <FleetWall fleet={fleet} locFilter={fleetLoc} now={now} onDrill={(slug, target) => { setLocation(slug); setView(target); }} />
          </>
        ) : view === "chef" ? (
          <ChefView
            checks={expoChecks}
            allDayGroups={allDayByStation}
            stats={chefStats}
            chefFocus={chefFocus}
            onFocus={setChefFocus}
            onFullscreen={toggleKiosk}
            controls={boardActions}
            onAdvance={advance}
            onRegress={regress}
            now={now}
          />
        ) : (
          <>
            {/* Board toolbar first (mockup: command row on top, divider under it),
                then the breadcrumb + section title. */}
            <div className="core-kds-toolbar">
              {laneFilter}
              <div className="core-kds-tb-sp" />
              {boardActions}
              <button type="button" className="core-iconbtn" title="Fullscreen kiosk" aria-label="Fullscreen kiosk" onClick={toggleKiosk}><ExpandIcon /></button>
            </div>
            <div className="core-crumb">
              CORE — KDS · KITCHEN WALL · <b>liquid glass</b> · <span className="fix">dark board · frosted kpis</span>
            </div>
            <div className="core-sectionhead">
              <h1>KDS · Pass — Floor</h1>
              <span className="sub">sla-toned tickets · start / bump / pass</span>
            </div>

            {/* frosted 7-cell strip — Active · At risk · Late · Ready ·
                Throughput · Covers · Revenue (Rule #1: throughput/covers/revenue
                from floor-ops, the rest from the live ticket stream). */}
            <div className="core-statstrip core-kds-strip">
              <div className="cell"><span className="lab">Active</span><span className="val">{counts.all}</span></div>
              <div className="cell"><span className="lab">At risk</span><span className="val amber">{counts.risk}</span></div>
              <div className="cell"><span className="lab">Late</span><span className="val danger">{counts.late}</span></div>
              <div className="cell"><span className="lab">Ready</span><span className="val basil">{counts.ready}</span></div>
              <div className="cell"><span className="lab">Throughput</span><span className="val">{ops?.throughputLastHour ?? "—"}<small> /hr</small></span></div>
              <div className="cell"><span className="lab">Covers</span><span className="val">{ops?.coversHr ?? "—"}<small> /hr</small></span></div>
              <div className="cell"><span className="lab">Revenue</span><span className="val info">{ops ? revPerHr(ops.revenueHr) : "—"}<small> zł/hr</small></span></div>
            </div>

            {allDayRail}

            {/* dark wall board — the station strip + three SLA-toned lanes on the
                inset board (mockup: New → Firing → Ready·Pass). */}
            <div className="core-wall">
              {stationStrip}
              {lane === "all" ? (
                <div className="core-lanes">
                  {KDS_COLUMNS.map((col) => {
                    const ts = visibleByStatus.get(col.id) ?? [];
                    return (
                      <div key={col.id} className="core-lane">
                        <div className="core-lane-h">
                          <span className="lt">{col.label}</span>
                          <span className="lc">{ts.length}</span>
                        </div>
                        <div className="core-lane-b">
                          {ts.length === 0 ? <div className="core-kds-empty">—</div> : ts.map(renderTicket)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="core-chefq">
                  {(visibleByStatus.get(lane) ?? []).map(renderTicket)}
                </div>
              )}
            </div>
          </>
        )}
    </div>
  );

  // Fullscreen kiosk — drop the shell chrome for the bare wall (Fleet/Floor/Chef).
  if (kiosk) {
    return (
      <div className="core-kiosk">
        <div className="core-kiosk-top">
          <span className="core-kiosk-brand">Ottaviano · KDS · {view === "fleet" ? "fleet" : location || "line"}</span>
          {controls}
          <button type="button" className="core-iconbtn" title="Exit fullscreen" onClick={toggleKiosk}>✕</button>
        </div>
        {board}
        {overlays}
      </div>
    );
  }

  return (
    <CoreShell eyebrow={`Kitchen Display · ${location || "all restaurants"}`} tabs={tabs} bleed>
      {board}
      {overlays}
    </CoreShell>
  );
}

// ---- 86 (eighty-six) — quick item availability ----
function EightySix({ location, open, onClose }: { location: string; open: boolean; onClose: () => void }) {
  const toast = useCoreToast();
  const [available, setAvailable] = useState<{ id: string; name: string; category: string }[]>([]);
  const [off, setOff] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!location) return;
    const [menu, es] = await Promise.all([
      fetch(`/api/agent/get_menu?location=${encodeURIComponent(location)}`).then((r) => (r.ok ? r.json() : { items: [] })),
      fetch(`/api/admin/kds/eighty-six?location=${encodeURIComponent(location)}`).then((r) => (r.ok ? r.json() : { eightySixed: [] })),
    ]);
    setAvailable((menu.items ?? []).map((m: { id: string; name: string; category: string }) => ({ id: m.id, name: m.name, category: m.category })));
    setOff(es.eightySixed ?? []);
  }, [location]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = async (id: string, name: string, makeAvailable: boolean) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/kds/eighty-six?location=${encodeURIComponent(location)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, available: makeAvailable }),
      });
      if (r.ok) {
        toast(makeAvailable ? `${name} restored` : `${name} 86'd`, "success");
        await load();
      } else toast("Could not update", "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <CoreDialog open={open} onClose={onClose} title="86 — item availability" width={520}>
      {off.length > 0 && (
        <>
          <h4 className="core-profile-h">86&apos;d · tap to restore</h4>
          <div className="core-86-chips">
            {off.map((m) => (
              <button key={m.id} className="core-86-chip off" disabled={busy === m.id} onClick={() => void toggle(m.id, m.name, true)}>
                {m.name} <span>↺</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h4 className="core-profile-h">On the menu · tap to 86</h4>
      <div className="core-86-chips">
        {available.length === 0 ? (
          <div className="core-ctx-empty">Loading…</div>
        ) : (
          available.map((m) => (
            <button key={m.id} className="core-86-chip" disabled={busy === m.id} onClick={() => void toggle(m.id, m.name, false)}>
              {m.name}
            </button>
          ))
        )}
      </div>
    </CoreDialog>
  );
}

// ---- Fleet (owner Atlas) ----
interface FleetStationWire {
  id: string;
  label: string;
  currentLoad: number;
  forecast: number;
  demand: number;
  capacity: number;
  pct: number;
  tier: "calm" | "warn" | "risk";
}
interface FleetTileWire {
  slug: string;
  name: string;
  city: string;
  code: string;
  district: string;
  area: string;
  eightySix: number;
  counts: { active: number; ready: number; late: number; risk: number };
  health: number;
  healthState: string;
  healthClass: "good" | "warn" | "risk" | "alert";
  onShift: number;
  throughputHr: number;
  coversHr: number;
  revenueHr: number;
  promiseAccuracy: number;
  stations: FleetStationWire[];
  tickets: KdsTicket[];
}
interface FleetWire {
  promiseTarget: number;
  paceWindowMin: number;
  benchmark: { fleetAccuracy: number; leader: string | null; gap: number };
  totals: { active: number; late: number; risk: number; ready: number; throughputHr: number; coversHr: number; revenueHr: number };
  tiles: FleetTileWire[];
}

// Most-urgent-first ordering for the per-truck ticket preview.
const TONE_RANK: Record<string, number> = { late: 4, risk: 3, warn: 2, firing: 1 };

// Złoty-per-hour figure, full with space-separated thousands (mockup: "2 180"):
// 218000 grosze → "2 180", 124000 → "1 240".
function revPerHr(grosze: number): string {
  return Math.round(grosze / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Compact "2× Margherita · Bufala +1" line for a preview row.
function dishSummary(t: KdsTicket): string {
  const parts = t.items.slice(0, 2).map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.name}` : it.name));
  const extra = t.items.length - 2;
  return parts.join(" · ") + (extra > 0 ? ` +${extra}` : "");
}

// healthClass → the status pill shown top-right on each truck card.
const HEALTH_PILL: Record<FleetTileWire["healthClass"], { label: string; cls: string }> = {
  good: { label: "On pace", cls: "ok" },
  warn: { label: "Backed up", cls: "warn" },
  risk: { label: "Under pressure", cls: "warn" },
  alert: { label: "Slammed", cls: "bad" },
};
// Pace tier → the SLA tone the station load bar + dot paint with.
const STN_TONE: Record<"calm" | "warn" | "risk", string> = {
  calm: "var(--t-ready)",
  warn: "var(--t-warn)",
  risk: "var(--t-late)",
};

function FleetWall({
  fleet,
  locFilter,
  now,
  onDrill,
}: {
  fleet: FleetWire | null;
  locFilter: string;
  now: number;
  onDrill: (slug: string, view: View) => void;
}) {
  if (!fleet) return <div className="core-kds-empty pad">Loading fleet…</div>;
  // Scope to the filtered kitchen(s); re-aggregate the totals band so the strip
  // reflects the selection (all trucks → the feed's totals verbatim).
  const tiles = fleet.tiles.filter((t) => locFilter === "all" || t.slug === locFilter);
  const tot =
    locFilter === "all"
      ? fleet.totals
      : {
          active: tiles.reduce((s, t) => s + t.counts.active, 0),
          late: tiles.reduce((s, t) => s + t.counts.late, 0),
          risk: tiles.reduce((s, t) => s + t.counts.risk, 0),
          ready: tiles.reduce((s, t) => s + t.counts.ready, 0),
          throughputHr: tiles.reduce((s, t) => s + t.throughputHr, 0),
          coversHr: tiles.reduce((s, t) => s + t.coversHr, 0),
          revenueHr: tiles.reduce((s, t) => s + t.revenueHr, 0),
        };
  return (
    <div className="core-fleet">
      <div className="core-statstrip">
        <div className="cell"><span className="lab">Kitchens</span><span className="val">{tiles.length}</span></div>
        <div className="cell"><span className="lab">Active</span><span className="val">{tot.active}</span></div>
        <div className="cell"><span className="lab">At risk</span><span className="val amber">{tot.risk}</span></div>
        <div className="cell"><span className="lab">Late</span><span className="val danger">{tot.late}</span></div>
        <div className="cell"><span className="lab">Ready</span><span className="val basil">{tot.ready}</span></div>
        <div className="cell"><span className="lab">Throughput</span><span className="val">{tot.throughputHr}<small> /hr</small></span></div>
        <div className="cell"><span className="lab">Covers</span><span className="val">{tot.coversHr}<small> /hr</small></span></div>
        <div className="cell"><span className="lab">Revenue</span><span className="val info">{revPerHr(tot.revenueHr)}<small> zł/hr</small></span></div>
      </div>
      <div className="core-fleet-grid">
        {tiles.map((t) => {
          // Only the loaded stations, hottest first — idle stations are noise.
          const stations = t.stations.filter((s) => s.demand > 0).sort((a, b) => b.pct - a.pct);
          // Lane split from the live tickets (the counts band only carries active/
          // ready/late/risk — New vs Firing is derived here, no mock data).
          const lanes = { fresh: 0, firing: 0, ready: 0 };
          for (const tk of t.tickets) {
            if (tk.status === "confirmed") lanes.fresh += 1;
            else if (tk.status === "preparing") lanes.firing += 1;
            else if (tk.status === "ready") lanes.ready += 1;
          }
          // Avg / oldest cook age across the open (non-ready) tickets.
          const ages = t.tickets.filter((tk) => tk.status !== "ready").map((tk) => Math.max(0, (now - tk.paidAtMs) / 1000));
          const oldest = ages.length ? Math.max(...ages) : 0;
          const avg = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
          const preview = [...t.tickets]
            .sort(
              (a, b) =>
                (TONE_RANK[toneForTicket(b, now)] ?? 0) - (TONE_RANK[toneForTicket(a, now)] ?? 0) ||
                a.paidAtMs - b.paidAtMs,
            )
            .slice(0, 3);
          const pill = HEALTH_PILL[t.healthClass];
          return (
            <div
              key={t.slug}
              className="core-truck glass"
              role="button"
              tabIndex={0}
              title={`Open ${t.name} floor`}
              onClick={() => onDrill(t.slug, "floor")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDrill(t.slug, "floor");
                }
              }}
            >
              <div className="core-truck-h">
                <span className={`core-truck-flag ${pill.cls}`} />
                <div className="core-truck-id">
                  <span className="nm">{t.city}</span>
                  <span className="code">
                    {t.code ? `${t.code}${t.district ? ` · ${t.district}` : ""}` : t.area || t.city}
                  </span>
                </div>
                <span className={`core-truck-pill ${pill.cls}`}>{pill.label}</span>
              </div>
              <div className="core-truck-mini">
                <div><span className="k">Active</span><span className="v">{t.counts.active}</span></div>
                <div><span className="k">Risk</span><span className={t.counts.risk ? "v warn" : "v"}>{t.counts.risk}</span></div>
                <div><span className="k">Late</span><span className={t.counts.late ? "v bad" : "v"}>{t.counts.late}</span></div>
                <div><span className="k">Avg cook</span><span className="v">{avg ? fmtClock(avg) : "—"}</span></div>
                <div><span className="k">Oldest</span><span className={oldest >= 600 ? "v bad" : "v"}>{oldest ? fmtClock(oldest) : "—"}</span></div>
              </div>
              <div className="core-truck-body">
                {stations.length > 0 && (
                  <div className="core-truck-stations">
                    {stations.map((s) => (
                      <span key={s.id} className="core-tstn">
                        <span className="dot" style={{ background: STN_TONE[s.tier] }} />
                        <span className="lab">{s.label}</span>
                        <span className="bar"><i style={{ width: `${Math.min(100, s.pct)}%`, background: STN_TONE[s.tier] }} /></span>
                        <span className="pct">{s.pct}%</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="core-lanesum">
                  <div className="ls fresh"><b>{lanes.fresh}</b>New</div>
                  <div className="ls firing"><b>{lanes.firing}</b>Firing</div>
                  <div className="ls ready"><b>{lanes.ready}</b>Ready</div>
                </div>
                <div className="core-mtks">
                  {preview.length === 0 ? (
                    <div className="core-preview-empty">No active tickets</div>
                  ) : (
                    preview.map((tk) => {
                      const due = dueLabel(tk, now);
                      return (
                        <div key={tk.id} className={`core-mtk tone-${due.tone}`}>
                          <span className="mid">#{tk.shortId}</span>
                          <span className="mdesc">{dishSummary(tk)}</span>
                          <span className={`mtimer tone-${due.tone}`}>{due.text}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Chef (expo pass + all-day, liquid-glass) ----
type ExpoNode = { course: PosCourse; label: string; st: "done" | "firing" | "wait" };
type ExpoCheck = { t: KdsTicket; nodes: ExpoNode[] };
type AllDayGroup = {
  cat: MenuCategory;
  label: string;
  load: number | null;
  tier: "calm" | "warn" | "risk";
  max: number;
  items: { name: string; qty: number }[];
};
type ChefStats = { onPass: number; awaiting: number; longestHold: number; allDayItems: number; inProgress: number; allergy: number };

const CHEF_TIER_TONE: Record<"calm" | "warn" | "risk", string> = {
  calm: "var(--t-ready)",
  warn: "var(--t-warn)",
  risk: "var(--t-late)",
};

function ChefView({
  checks,
  allDayGroups,
  stats,
  chefFocus,
  onFocus,
  onFullscreen,
  controls,
  onAdvance,
  onRegress,
  now,
}: {
  checks: ExpoCheck[];
  allDayGroups: AllDayGroup[];
  stats: ChefStats;
  chefFocus: "expo" | "allday";
  onFocus: (f: "expo" | "allday") => void;
  onFullscreen: () => void;
  controls: ReactNode;
  onAdvance: (t: KdsTicket) => void;
  onRegress: (t: KdsTicket) => void;
  now: number;
}) {
  const totalItems = allDayGroups.reduce((s, g) => s + g.items.reduce((n, i) => n + i.qty, 0), 0);
  return (
    <>
      <div className="core-kds-toolbar">
        <div className="core-seg">
          <button className={chefFocus === "expo" ? "on" : ""} onClick={() => onFocus("expo")}>Expo</button>
          <button className={chefFocus === "allday" ? "on" : ""} onClick={() => onFocus("allday")}>All-day</button>
        </div>
        <div className="core-kds-tb-sp" />
        {controls}
        <button type="button" className="core-iconbtn" title="Fullscreen kiosk" aria-label="Fullscreen kiosk" onClick={onFullscreen}><ExpandIcon /></button>
      </div>
      <div className="core-crumb">
        CORE — KDS · CHEF · <b>liquid glass</b> · <span className="fix">expo pass · all-day prep</span>
      </div>
      <div className="core-sectionhead">
        <h1>KDS · Chef — Expo &amp; all-day</h1>
        <span className="sub">coursing · expedite · all-day prep counts</span>
      </div>
      <div className="core-statstrip core-kds-strip">
        <div className="cell"><span className="lab">On the pass</span><span className="val basil">{stats.onPass}</span></div>
        <div className="cell"><span className="lab">Awaiting course</span><span className="val amber">{stats.awaiting}</span></div>
        <div className="cell"><span className="lab">Longest hold</span><span className={stats.longestHold >= 480 ? "val danger" : "val"}>{stats.longestHold ? fmtClock(stats.longestHold) : "—"}</span></div>
        <div className="cell"><span className="lab">All-day items</span><span className="val">{stats.allDayItems}</span></div>
        <div className="cell"><span className="lab">In progress</span><span className="val info">{stats.inProgress}</span></div>
        <div className="cell"><span className="lab">Allergy flags</span><span className={stats.allergy ? "val danger" : "val"}>{stats.allergy}</span></div>
      </div>
      <div className={`core-chef-grid ${chefFocus}`}>
        <div className="core-panel">
          <div className="core-panel-h">All-day · by station <span className="c">{totalItems} items</span></div>
          <div className="core-panel-b">
            {allDayGroups.length === 0 ? (
              <div className="core-kds-empty">Nothing on the line.</div>
            ) : (
              allDayGroups.map((g) => (
                <div key={g.cat} className="core-ad-group">
                  <div className="core-ad-glab">
                    <span className="dot" style={{ background: CHEF_TIER_TONE[g.tier] }} />
                    {g.label}
                    {g.load !== null && <span className="load">load {g.load}%</span>}
                  </div>
                  {g.items.map((it) => (
                    <div key={it.name} className="core-ad-row">
                      <span className="ad-q">{it.qty}×</span>
                      <span className="ad-nm">{it.name}</span>
                      <span className="ad-bar"><i style={{ width: `${Math.round((it.qty / g.max) * 100)}%`, background: CHEF_TIER_TONE[g.tier] }} /></span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
        {chefFocus === "expo" && (
          <div className="core-panel">
            <div className="core-panel-h">Expo pass · coursing <span className="c">{checks.length} checks</span></div>
            <div className="core-expo-list">
              {checks.length === 0 ? (
                <div className="core-kds-empty">No active checks.</div>
              ) : (
                checks.map(({ t, nodes }) => (
                  <ExpoCard key={t.id} t={t} nodes={nodes} now={now} onAdvance={onAdvance} onRegress={onRegress} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ExpoCard({
  t,
  nodes,
  now,
  onAdvance,
  onRegress,
}: {
  t: KdsTicket;
  nodes: ExpoNode[];
  now: number;
  onAdvance: (t: KdsTicket) => void;
  onRegress: (t: KdsTicket) => void;
}) {
  const due = dueLabel(t, now);
  const next = nextStatus(t.status);
  const canRecall = !!prevStatus(t.status);
  const primary = t.status === "ready" ? "Expedite" : t.status === "preparing" ? "Bump to pass" : "Start firing";
  return (
    <div className={`core-expo-card t-${due.tone}`}>
      <div className="core-expo-top">
        <span className="tt">#{t.shortId}</span>
        <span className="chip">{channelTag(t)}</span>
        <span className={`due t-${due.tone}`}>{due.text}</span>
      </div>
      {nodes.length > 0 && (
        <div className="core-cspine">
          {nodes.map((n) => (
            <div key={n.course} className={`core-cnode ${n.st}`}>
              <span className="d" />
              <span className="lb">{n.label}</span>
            </div>
          ))}
        </div>
      )}
      {t.simulated ? (
        <div className="core-expo-sim">Simulation — not a real order</div>
      ) : (
        <div className="core-expo-act">
          {next && (
            <button type="button" className="go" onClick={() => onAdvance(t)}>
              {primary}
            </button>
          )}
          {canRecall && (
            <button type="button" onClick={() => onRegress(t)}>
              Recall
            </button>
          )}
        </div>
      )}
    </div>
  );
}
