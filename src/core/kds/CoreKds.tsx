"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "@/shared/LocationContext";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import { idempotentFetch } from "@/lib/idempotentFetch";
import { analyzeTruck } from "@/lib/kds-prediction";
import { buildKdsTicket, type KdsTicket, type KdsTicketItem } from "@/lib/kds-ticket";
import { useSelection, type CoreSelection } from "@/core/shell/SelectionContext";
import { POS_COURSE_LABELS } from "@/lib/pos-coursing";
import {
  KDS_COLUMNS,
  STATION_FILTERS,
  fmtClock,
  groupTicketsByColumn,
  nextStatus,
  toneForTicket,
} from "@/core/kds/kds-board";
import { MENU_CATEGORY_LABELS, type MenuCategory, type OrderStatus } from "@/data/types";

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
    .map(([, arr]) => [arr[0].categoryLabel, arr] as [string, KdsTicketItem[]]);
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
  onAdvance,
  onPick,
}: {
  t: KdsTicket;
  station: MenuCategory | "all";
  updating: boolean;
  onAdvance: (t: KdsTicket) => void;
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
  return (
    <div className={`core-tk t-${due.tone}${t.simulated ? " sim" : ""}`}>
      <div
        className="core-tk-h"
        onClick={() => {
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
        <div className="core-tk-course">Coursed · {held.map((c) => POS_COURSE_LABELS[c]).join(", ")} held</div>
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
        <button type="button" className="core-bump" disabled={updating} onClick={() => onAdvance(t)}>
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
  const { select } = useSelection();
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
    return groupTicketsByColumn(tickets, station);
  }, [orders, station, now]);

  const allTickets = useMemo(() => KDS_COLUMNS.flatMap((c) => visibleByStatus.get(c.id) ?? []), [visibleByStatus]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTickets.length };
    for (const col of KDS_COLUMNS) c[col.id] = (visibleByStatus.get(col.id) ?? []).length;
    c.risk = allTickets.filter((t) => t.atRisk && t.status !== "ready").length;
    c.late = allTickets.filter((t) => t.promisedReadyAtMs !== null && t.promisedReadyAtMs < now && t.status !== "ready").length;
    return c;
  }, [visibleByStatus, allTickets, now]);

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
  }, [view]);

  // ----- Manager ops metrics (throughput + on-shift, the live floor-ops feed)
  const [ops, setOps] = useState<{ throughputLastHour: number; onShift: number } | null>(null);
  useEffect(() => {
    if (view === "fleet" || !location) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/admin/kds/floor-ops?location=${encodeURIComponent(location)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setOps({ throughputLastHour: d.throughputLastHour ?? 0, onShift: d.onShift ?? 0 });
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

  // Oldest + mean age across the open (non-ready) tickets — the floor pressure.
  const ageStats = useMemo(() => {
    const ages = allTickets.filter((t) => t.status !== "ready").map((t) => Math.max(0, (now - t.paidAtMs) / 1000));
    if (ages.length === 0) return { oldest: 0, avg: 0 };
    return { oldest: Math.max(...ages), avg: ages.reduce((a, b) => a + b, 0) / ages.length };
  }, [allTickets, now]);

  // The cook's focused-station depth: how many tickets touch this station and
  // the oldest one waiting — the Chef view's queue pressure.
  const chefDepth = useMemo(() => {
    const ts = station === "all" ? allTickets : allTickets.filter((t) => t.items.some((it) => it.category === station));
    const ages = ts.filter((t) => t.status !== "ready").map((t) => Math.max(0, (now - t.paidAtMs) / 1000));
    return { count: ts.length, oldest: ages.length ? Math.max(...ages) : 0 };
  }, [allTickets, station, now]);

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

  const renderTicket = (t: KdsTicket) => (
    <TicketCard key={t.id} t={t} station={station} updating={updatingId === t.id} onAdvance={advance} onPick={select} />
  );

  const controls =
    view === "fleet" ? null : (
      <>
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
          className={showAllDay ? "core-iconbtn on" : "core-iconbtn"}
          title="All-day — batch counts per dish"
          aria-pressed={showAllDay}
          onClick={() => setShowAllDay((v) => !v)}
        >
          Σ
        </button>
        <button type="button" className="core-iconbtn" title="Refresh now" onClick={() => refresh()}>⟳</button>
        <button type="button" className="core-iconbtn" title="86 an item" onClick={() => setEightySixOpen(true)}>86</button>
        <button type="button" className="core-iconbtn" title={soundOn ? "Mute" : "Chime on new ticket"} onClick={() => setSoundOn((s) => !s)}>
          {soundOn ? "🔔" : "🔕"}
        </button>
        <button type="button" className="core-iconbtn" title={paused ? "Resume" : "Pause"} onClick={() => setPaused((p) => !p)}>
          {paused ? "▶" : "❚❚"}
        </button>
      </>
    );

  const overlays = (
    <EightySix location={location || ""} open={eightySixOpen} onClose={() => setEightySixOpen(false)} />
  );

  const board = (
    <div className="core-kds">
        {view === "fleet" ? (
          <FleetWall fleet={fleet} now={now} onDrill={(slug, target) => { setLocation(slug); setView(target); }} />
        ) : (
          <>
            <div className="core-kpi">
              <div className="k"><div className="kl">Open</div><div className="kv">{counts.all}</div></div>
              <div className="k"><div className="kl">New</div><div className="kv">{counts.confirmed}</div></div>
              <div className="k"><div className="kl">Firing</div><div className="kv i">{counts.preparing}</div></div>
              <div className="k"><div className="kl">Ready</div><div className="kv ok">{counts.ready}</div></div>
              <div className="k"><div className="kl">At risk</div><div className={counts.risk ? "kv warn" : "kv"}>{counts.risk}</div></div>
              <div className="k"><div className="kl">Late</div><div className={counts.late ? "kv bad" : "kv"}>{counts.late}</div></div>
              <div className="k"><div className="kl">Oldest</div><div className={ageStats.oldest >= 600 ? "kv bad" : "kv"}>{ageStats.oldest ? fmtClock(ageStats.oldest) : "—"}</div></div>
              <div className="k"><div className="kl">Avg age</div><div className="kv">{ageStats.avg ? fmtClock(ageStats.avg) : "—"}</div></div>
              <div className="k"><div className="kl">Done/hr</div><div className="kv ok">{ops?.throughputLastHour ?? "—"}</div></div>
              <div className="k"><div className="kl">On shift</div><div className="kv">{ops?.onShift ?? "—"}</div></div>
            </div>

            {/* station strip (chef + floor) */}
            <div className="core-stations">
              {stationsPresent.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={station === s.id ? "core-stn on" : "core-stn"}
                  onClick={() => setStation(s.id)}
                >
                  {s.id === "all" ? "All stations" : MENU_CATEGORY_LABELS[s.id as MenuCategory]}
                </button>
              ))}
            </div>

            {/* All-day batch rail — what the line still has to cook, biggest
                first. Toggled by the Σ control; live from the active tickets. */}
            {showAllDay && (
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
            )}

            {view === "chef" ? (
              <>
                <div className="core-chef-depth">
                  <div><span className="dl">In queue</span><span className="dv">{chefDepth.count}</span></div>
                  <div><span className="dl">Oldest</span><span className={chefDepth.oldest >= 480 ? "dv warn" : "dv"}>{chefDepth.oldest ? fmtClock(chefDepth.oldest) : "—"}</span></div>
                  <div className="dstn">{station === "all" ? "All stations" : MENU_CATEGORY_LABELS[station]}</div>
                </div>
                <div className="core-chefq">
                  {allTickets.length === 0 ? (
                    <div className="core-kds-empty">No active tickets.</div>
                  ) : (
                    allTickets.map(renderTicket)
                  )}
                </div>
              </>
            ) : lane === "all" ? (
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
          </>
        )}
    </div>
  );

  // Fullscreen kiosk — drop the shell chrome for the bare wall (Floor/Chef).
  if (kiosk && view !== "fleet") {
    return (
      <div className="core-kiosk">
        <div className="core-kiosk-top">
          <span className="core-kiosk-brand">Ottaviano · KDS · {location || "line"}</span>
          {controls}
          <button type="button" className="core-iconbtn" title="Exit fullscreen" onClick={toggleKiosk}>✕</button>
        </div>
        {board}
        {overlays}
      </div>
    );
  }

  return (
    <CoreShell
      eyebrow={`Kitchen Display · ${location || "all restaurants"}`}
      tabs={tabs}
      bleed
      subRight={
        <>
          {controls}
          {view !== "fleet" && (
            <button type="button" className="core-iconbtn" title="Fullscreen kiosk" onClick={toggleKiosk}>⛶</button>
          )}
        </>
      }
    >
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
  counts: { active: number; ready: number; late: number; risk: number };
  health: number;
  healthState: string;
  healthClass: "good" | "warn" | "risk" | "alert";
  onShift: number;
  throughputHr: number;
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

// Compact złoty-per-hour figure: 3140 grosze → "31", 310000 → "3.1k".
function revPerHr(grosze: number): string {
  const z = grosze / 100;
  return z >= 1000 ? `${(z / 1000).toFixed(1)}k` : `${Math.round(z)}`;
}

// Compact "2× Margherita · Bufala +1" line for a preview row.
function dishSummary(t: KdsTicket): string {
  const parts = t.items.slice(0, 2).map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.name}` : it.name));
  const extra = t.items.length - 2;
  return parts.join(" · ") + (extra > 0 ? ` +${extra}` : "");
}

function FleetWall({ fleet, now, onDrill }: { fleet: FleetWire | null; now: number; onDrill: (slug: string, view: View) => void }) {
  if (!fleet) return <div className="core-kds-empty pad">Loading fleet…</div>;
  const { benchmark, promiseTarget, paceWindowMin } = fleet;
  const leaderSlug = fleet.tiles.reduce<FleetTileWire | null>(
    (best, t) => (t.promiseAccuracy > (best?.promiseAccuracy ?? -1) ? t : best),
    null,
  )?.slug;
  const tot = fleet.totals;
  return (
    <div className="core-fleet">
      <div className="core-fleet-kpi">
        <div className="kc"><div className="l">Active</div><div className="v">{tot.active}</div><div className="s">{tot.ready} ready for expo</div></div>
        <div className="kc"><div className="l">At risk</div><div className="v warn">{tot.risk}</div><div className="s">predicted miss</div></div>
        <div className="kc"><div className="l">Late</div><div className="v bad">{tot.late}</div><div className="s">over SLA</div></div>
        <div className="kc"><div className="l">Ready</div><div className="v ok">{tot.ready}</div><div className="s">for expo</div></div>
        <div className="kc"><div className="l">Throughput</div><div className="v">{tot.throughputHr}<span className="u">/hr</span></div><div className="s">last 60 min</div></div>
        <div className="kc"><div className="l">Covers</div><div className="v">{tot.coversHr}<span className="u">/hr</span></div><div className="s">seated</div></div>
        <div className="kc"><div className="l">Revenue</div><div className="v">{revPerHr(tot.revenueHr)}<span className="u"> zł/hr</span></div><div className="s">live</div></div>
      </div>
      <div className="core-fleet-bench">
        <div className="hd">
          <span>Promise-accuracy · cross-truck benchmark</span>
          <span>
            fleet {Math.round(benchmark.fleetAccuracy)}% · target {promiseTarget}%
            {benchmark.leader && benchmark.gap > 0
              ? ` · ${benchmark.leader} leads by ${Math.round(benchmark.gap)} pts`
              : ""}
          </span>
        </div>
        {fleet.tiles.map((t) => {
          const below = t.promiseAccuracy < promiseTarget;
          return (
            <div key={t.slug} className="core-benchrow">
              <span className="nm">{t.name}</span>
              <div className="core-track">
                <i className={below ? "warn" : ""} style={{ width: `${Math.min(100, Math.round(t.promiseAccuracy))}%` }} />
              </div>
              <span className="pv">
                {Math.round(t.promiseAccuracy)}%{!below && t.slug === leaderSlug ? " LEAD" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="core-fleet-grid">
        {fleet.tiles.map((t) => {
          // Only the loaded stations, hottest first — idle stations are noise.
          const stations = t.stations.filter((s) => s.demand > 0).sort((a, b) => b.pct - a.pct);
          const fallingBehind = stations.some((s) => s.tier === "risk");
          const preview = [...t.tickets]
            .sort(
              (a, b) =>
                (TONE_RANK[toneForTicket(b, now)] ?? 0) - (TONE_RANK[toneForTicket(a, now)] ?? 0) ||
                a.paidAtMs - b.paidAtMs,
            )
            .slice(0, 3);
          return (
            <div key={t.slug} className="core-truck">
              <div className="core-truck-h">
                <div className={`core-ring ${t.healthClass}`}>{t.health}</div>
                <div className="core-truck-id">
                  <div className="nm">{t.name}</div>
                  <div className="sub">
                    Open · {t.counts.active} active · <b className={`h-${t.healthClass}`}>{t.healthState.toUpperCase()}</b>
                  </div>
                </div>
                <div className="core-truck-drill">
                  <button type="button" onClick={() => onDrill(t.slug, "floor")}>Open floor →</button>
                  <button type="button" onClick={() => onDrill(t.slug, "chef")}>Chef line →</button>
                </div>
              </div>
              <div className="core-truck-stats">
                <div><span className="sl">Active</span><span className="sv">{t.counts.active}</span></div>
                <div><span className="sl">At risk</span><span className={t.counts.risk ? "sv warn" : "sv"}>{t.counts.risk}</span></div>
                <div><span className="sl">Late</span><span className={t.counts.late ? "sv bad" : "sv"}>{t.counts.late}</span></div>
                <div><span className="sl">Ready</span><span className="sv">{t.counts.ready}</span></div>
                <div><span className="sl">On shift</span><span className="sv">{t.onShift}</span></div>
              </div>
              {stations.length > 0 && (
                <div className="core-pace">
                  <div className="core-pace-h">
                    Pace · next {paceWindowMin}m
                    {fallingBehind && <span className="bad"> · predicted to fall behind</span>}
                  </div>
                  {stations.map((s) => (
                    <div key={s.id} className="core-pace-row">
                      <span className="lab">{s.label}</span>
                      <div className="core-track">
                        <i
                          className={`tier-${s.tier}`}
                          style={{
                            width: `${Math.min(100, s.capacity > 0 ? Math.round((s.currentLoad / s.capacity) * 100) : 100)}%`,
                          }}
                        />
                      </div>
                      <span className="pv">
                        {s.currentLoad}/{Math.round(s.capacity)}
                        {s.forecast > 0 ? ` · +${s.forecast}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="core-preview">
                {preview.length === 0 ? (
                  <div className="core-preview-empty">No active tickets</div>
                ) : (
                  preview.map((tk) => {
                    const due = dueLabel(tk, now);
                    return (
                      <div key={tk.id} className={`core-prow tone-${due.tone}`}>
                        <span className="pid">#{tk.shortId}</span>
                        <span className="chip">{channelTag(tk)}</span>
                        <span className="dish">{dishSummary(tk)}</span>
                        <span className={`t tone-${due.tone}`}>{due.text}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
