"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronLeft,
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import type { MenuCategory, OrderStatus } from "@/data/types";
import { formatPricePLN } from "@/lib/utils";
import { useToast } from "./v2/ui/Toast";
import { ticketTone, computeHealth, type PaceTier, type TicketTone } from "@/lib/kds-prediction";
import { KdsTicketCard, Ring } from "./kds/KdsTicketCard";
import { KdsStatGrid, type KdsStat } from "./kds/KdsStatGrid";
import { fmtWallClock } from "./kds-board";
import type { KdsTicket } from "@/lib/kds-ticket";
import { useKdsSimulator } from "@/lib/useKdsSimulator";

/* ============================ Wire types ============================ */

interface WireStation {
  id: MenuCategory;
  label: string;
  currentLoad: number;
  forecast: number;
  demand: number;
  capacity: number;
  pct: number;
  tier: PaceTier;
}
type WireTicket = KdsTicket;
interface WireTile {
  slug: string;
  name: string;
  counts: { active: number; ready: number; late: number; risk: number; newCount: number; preparing: number };
  health: number;
  healthState: string;
  healthClass: "good" | "warn" | "risk" | "alert";
  onShift: number;
  throughputHr: number;
  coversHr: number;
  revenueHr: number;
  completedToday: number;
  revenueToday: number;
  promiseAccuracy: number;
  throughputSeries: number[];
  stations: WireStation[];
  bottleneck: { id: MenuCategory; label: string; pct: number; tier: PaceTier } | null;
  tickets: WireTicket[];
}
interface FleetPayload {
  generatedAt: string;
  paceWindowMin: number;
  promiseTarget: number;
  totals: { active: number; late: number; risk: number; ready: number; throughputHr: number; coversHr: number; revenueHr: number };
  benchmark: { fleetAccuracy: number; leader: string | null; lagger: string | null; gap: number };
  tiles: WireTile[];
}

const POLL_MS = 6000;

type LineKey = "all" | "new" | "prep" | "ready" | "expo";
const LINES: { key: LineKey; title: string }[] = [
  { key: "all", title: "All" },
  { key: "new", title: "New" },
  { key: "prep", title: "In progress" },
  { key: "ready", title: "Ready" },
  { key: "expo", title: "Expo" },
];

const STATIONS: { id: MenuCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pizza", label: "Pizza" },
  { id: "pasta", label: "Pasta" },
  { id: "antipasti", label: "Antipasti" },
  { id: "panini", label: "Panini" },
  { id: "drinks", label: "Drinks" },
  { id: "desserts", label: "Desserts" },
];

const NEXT_STATUS: Record<string, OrderStatus | null> = { confirmed: "preparing", preparing: "ready", ready: "completed" };

/* ============================ Format helpers ============================ */

function zl(grosze: number): string {
  return formatPricePLN(grosze);
}

const TONE_ORDER: Record<TicketTone, number> = { late: 0, risk: 1, warn: 2, firing: 3, queued: 4, ready: 5 };

/* ============================ SVG bits ============================ */

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 64;
  const h = 20;
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - 2 - ((p - min) / span) * (h - 4)] as const);
  const d = "M" + coords.map((c) => `${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(" L ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={area} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ============================ Component ============================ */

export function AdminKdsFleet({ onDrillIn }: { onDrillIn?: (slug: string) => void }) {
  const toast = useToast();
  // The sandbox simulator is a global setting, so the fleet wall flags it the
  // same way the floor board does (the fleet feed opts into simulated tickets).
  const { enabled: simEnabled } = useKdsSimulator(null);
  const [data, setData] = useState<FleetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [station, setStation] = useState<MenuCategory | "all">("all");
  const [line, setLine] = useState<LineKey>("all");
  const [fullscreen, setFullscreen] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Opt into sandbox tickets like the floor board — a no-op when the
      // simulator is off (sims are purged then), a marked SIMULATION rush when on.
      const res = await fetch("/api/admin/kds/fleet?includeSimulated=1");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as FleetPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // 1 s tick drives live timers + tone thresholds (the predictive tier shifts
  // across the SLA boundary in real time, between server polls).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fullscreen — request native fullscreen, fall back to the immersive class.
  const enterFs = useCallback(() => {
    setFullscreen(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const exitFs = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFs();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, exitFs]);

  const advance = useCallback(
    async (t: WireTicket) => {
      const next = NEXT_STATUS[t.status];
      if (!next) return;
      setAdvancingId(t.id);
      try {
        const res = await fetch("/api/admin/orders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: t.id, status: next }),
        });
        if (!res.ok) {
          toast.error("Could not advance", "Try refreshing the fleet.");
          return;
        }
        // Optimistic local update — the next poll reconciles.
        setData((d) => {
          if (!d) return d;
          return {
            ...d,
            tiles: d.tiles.map((tile) => ({
              ...tile,
              tickets:
                next === "completed"
                  ? tile.tickets.filter((x) => x.id !== t.id)
                  : tile.tickets.map((x) => (x.id === t.id ? { ...x, status: next } : x)),
            })),
          };
        });
        void load();
      } finally {
        setAdvancingId(null);
      }
    },
    [load, toast],
  );

  // Live tone per ticket + fleet line counts (composed with the station filter).
  const toneOf = useCallback(
    (t: WireTicket): TicketTone =>
      ticketTone({
        status: t.status,
        promisedReadyAtMs: t.promisedReadyAtMs,
        predictedReadyAtMs: t.predictedReadyAtMs,
        nowMs: now,
      }),
    [now],
  );

  const matchesStation = useCallback(
    (t: WireTicket) => station === "all" || t.items.some((i) => i.category === station),
    [station],
  );
  const matchesLine = useCallback(
    (t: WireTicket) => {
      if (line === "all") return true;
      if (line === "new") return t.status === "confirmed";
      if (line === "prep") return t.status === "preparing";
      return t.status === "ready"; // ready + expo
    },
    [line],
  );

  const lineCounts = useMemo(() => {
    const counts: Record<LineKey, number> = { all: 0, new: 0, prep: 0, ready: 0, expo: 0 };
    if (!data) return counts;
    for (const tile of data.tiles) {
      for (const t of tile.tickets) {
        if (!matchesStation(t)) continue;
        counts.all++;
        if (t.status === "confirmed") counts.new++;
        else if (t.status === "preparing") counts.prep++;
        else if (t.status === "ready") {
          counts.ready++;
          counts.expo++;
        }
      }
    }
    return counts;
  }, [data, matchesStation]);

  const clock = useMemo(() => fmtWallClock(now), [now]);

  const board = (
    <div className={`kds-atlas${fullscreen ? " is-fullscreen" : ""}`}>
      {/* ---------------- Header ---------------- */}
      <header className="ka-head">
        <div className="ka-brand">
          <span className="ka-wordmark">SUD ITALIA</span>
          <span className="ka-kd-label">Fleet command</span>
          {simEnabled && <span className="ka-sandbox">Sandbox</span>}
        </div>
        <div className="ka-filters" role="group" aria-label="Station filter">
          {STATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="ka-chip"
              aria-pressed={s.id === station}
              onClick={() => setStation(s.id as MenuCategory | "all")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ka-lines" role="group" aria-label="Lines switcher">
          {LINES.map((l) => (
            <button
              key={l.key}
              type="button"
              className="ka-line"
              data-line={l.key}
              aria-pressed={l.key === line}
              onClick={() => setLine(l.key)}
            >
              <span>{l.title}</span>
              <span className="ka-lcount tabular">{lineCounts[l.key]}</span>
            </button>
          ))}
        </div>
        <div className="ka-spacer" />
        <button
          type="button"
          className="ka-fsbtn"
          onClick={fullscreen ? exitFs : enterFs}
          aria-pressed={fullscreen}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen fleet wall"}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span>{fullscreen ? "Exit" : "Fullscreen"}</span>
        </button>
        <button type="button" className="ka-fsbtn" onClick={() => void load()} title="Refresh now">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
        <div className="ka-clock tabular">{clock}</div>
      </header>

      {/* ---------------- Fleet command bar ---------------- */}
      {data && (
        <FleetBar
          data={data}
          liveCounts={lineCounts}
          now={now}
          toneOf={toneOf}
        />
      )}

      {/* ---------------- Boards ---------------- */}
      {loading && !data ? (
        <div className="ka-loading">Loading fleet…</div>
      ) : error && !data ? (
        <div className="ka-loading ka-error">
          <AlertTriangle className="h-4 w-4" /> Couldn’t load fleet — {error}
        </div>
      ) : data && data.tiles.length === 0 ? (
        <div className="ka-loading">No active trucks. Activate a location to see it here.</div>
      ) : (
        <div className="ka-boards">
          {data?.tiles.map((tile) => (
            <TruckBoard
              key={tile.slug}
              tile={tile}
              now={now}
              paceWindowMin={data.paceWindowMin}
              station={station}
              toneOf={toneOf}
              matchesStation={matchesStation}
              matchesLine={matchesLine}
              advancingId={advancingId}
              onAdvance={advance}
              onDrillIn={onDrillIn}
            />
          ))}
        </div>
      )}
    </div>
  );

  return fullscreen ? createPortal(board, document.body) : board;
}

/* ============================ Fleet bar ============================ */

function FleetBar({
  data,
  now,
  toneOf,
}: {
  data: FleetPayload;
  liveCounts: Record<LineKey, number>;
  now: number;
  toneOf: (t: WireTicket) => TicketTone;
}) {
  // Recompute late / at-risk / ready live across all trucks so the headline
  // tiles shift the moment a ticket crosses a threshold.
  let active = 0;
  let late = 0;
  let risk = 0;
  let ready = 0;
  for (const tile of data.tiles) {
    for (const t of tile.tickets) {
      const tone = toneOf(t);
      if (tone === "ready") {
        ready++;
        continue;
      }
      active++;
      if (tone === "late") late++;
      else if (tone === "risk") risk++;
    }
  }
  void now;
  const { totals, benchmark, promiseTarget } = data;

  const stats: KdsStat[] = [
    { label: "Active", value: active, sub: `${ready} ready` },
    { label: "At risk", value: risk, sub: "predicted miss", tone: risk > 0 ? "risk" : undefined },
    { label: "Late", value: late, sub: "over SLA", tone: late > 0 ? "alert" : "good" },
    { label: "Ready", value: ready, sub: "for expo", tone: ready > 0 ? "good" : undefined },
    { label: "Throughput", value: totals.throughputHr, sub: "/ hr fleet", tone: "good" },
    { label: "Covers", value: totals.coversHr, sub: "/ hr fleet" },
    { label: "Revenue", value: zl(totals.revenueHr), sub: "/ hr fleet" },
  ];

  return (
    <section className="ka-fleetbar" aria-label="Fleet aggregate metrics">
      <div className="ka-fb-eyebrow">
        <span className="ka-fb-brandline">
          <MapPin className="h-3 w-3" /> Fleet command
        </span>
        <span className="ka-fb-sep" />
        <span className="ka-fb-trucks">
          <b>{data.tiles.length}</b> {data.tiles.length === 1 ? "truck" : "trucks"} live
        </span>
      </div>
      <KdsStatGrid stats={stats} />
      <div className="ka-fb-benchmark">
        <span className="ka-fb-bm-lab">Promise-accuracy · cross-truck benchmark</span>
        <div className="ka-bm-rows">
          {data.tiles.map((t) => {
            const isLeader = t.name === benchmark.leader && data.tiles.length > 1;
            const color =
              t.promiseAccuracy >= promiseTarget
                ? "var(--ka-ready)"
                : t.promiseAccuracy >= promiseTarget - 5
                  ? "var(--ka-warn)"
                  : "var(--ka-late)";
            return (
              <div className="ka-bm-row" key={t.slug}>
                <span className="ka-bm-name">
                  {t.name}
                  {isLeader && <span className="ka-bm-lead">Lead</span>}
                </span>
                <span className="ka-bm-track">
                  <span className="ka-bm-fill" style={{ width: `${t.promiseAccuracy}%`, background: color }} />
                  <span className="ka-bm-mark" style={{ left: `${promiseTarget}%` }} title={`target ${promiseTarget}%`} />
                </span>
                <span className="ka-bm-pct tabular">{t.promiseAccuracy}%</span>
              </div>
            );
          })}
        </div>
        <div className="ka-bm-foot">
          {data.tiles.map((t, i) => (
            <span key={t.slug}>
              {i > 0 && " · "}
              {t.name} <b>{t.promiseAccuracy}%</b>
            </span>
          ))}
          {" · "}fleet <b>{benchmark.fleetAccuracy}%</b>
          {benchmark.leader && benchmark.lagger && benchmark.leader !== benchmark.lagger && (
            <>
              {" — "}
              <b style={{ color: "var(--ka-ready)" }}>{benchmark.leader}</b> leads {benchmark.lagger} by {benchmark.gap} pts
            </>
          )}
          {" (target "}
          {promiseTarget}%)
        </div>
      </div>
    </section>
  );
}

/* ============================ Truck board ============================ */

function TruckBoard({
  tile,
  now,
  paceWindowMin,
  station,
  toneOf,
  matchesStation,
  matchesLine,
  advancingId,
  onAdvance,
  onDrillIn,
}: {
  tile: WireTile;
  now: number;
  paceWindowMin: number;
  station: MenuCategory | "all";
  toneOf: (t: WireTicket) => TicketTone;
  matchesStation: (t: WireTicket) => boolean;
  matchesLine: (t: WireTicket) => boolean;
  advancingId: string | null;
  onAdvance: (t: WireTicket) => void;
  onDrillIn?: (slug: string) => void;
}) {
  // Live counts for the header stat row.
  let late = 0;
  let risk = 0;
  let ready = 0;
  let activeCount = 0;
  for (const t of tile.tickets) {
    const tone = toneOf(t);
    if (tone === "ready") {
      ready++;
      continue;
    }
    activeCount++;
    if (tone === "late") late++;
    else if (tone === "risk") risk++;
  }
  const liveHealth = computeHealth({ late, risk, promiseAcc: tile.promiseAccuracy });
  const healthColor =
    liveHealth.cls === "alert"
      ? "var(--ka-late)"
      : liveHealth.cls === "risk"
        ? "var(--ka-risk)"
        : liveHealth.cls === "warn"
          ? "var(--ka-warn)"
          : "var(--ka-ready)";

  const visible = tile.tickets
    .filter((t) => matchesStation(t) && matchesLine(t))
    .sort((a, b) => {
      const d = TONE_ORDER[toneOf(a)] - TONE_ORDER[toneOf(b)];
      if (d !== 0) return d;
      const sa = a.promisedReadyAtMs ?? Infinity;
      const sb = b.promisedReadyAtMs ?? Infinity;
      return sa - sb;
    });

  // Pace geometry — shared scale so every bar is comparable; mark at 100%.
  const maxUtil = Math.max(1.5, ...tile.stations.map((s) => (Number.isFinite(s.pct) ? s.pct / 100 : 1.5)));
  const markLeft = (1 / maxUtil) * 100;
  const bottleneck = tile.bottleneck;

  return (
    <section className="ka-truck">
      {/* Truck header */}
      <div
        className="ka-thead"
        role={onDrillIn ? "button" : undefined}
        tabIndex={onDrillIn ? 0 : undefined}
        onClick={onDrillIn ? () => onDrillIn(tile.slug) : undefined}
        onKeyDown={
          onDrillIn
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDrillIn(tile.slug);
                }
              }
            : undefined
        }
        title={onDrillIn ? `Drill into ${tile.name}'s floor board` : undefined}
      >
        <div className="ka-th-top">
          <span className="ka-th-loc">
            <MapPin className="h-3.5 w-3.5" /> {tile.name}
          </span>
          {onDrillIn && (
            <span className="ka-th-drillhint">
              Drill in <ChevronLeft className="h-3 w-3" style={{ transform: "rotate(180deg)" }} />
            </span>
          )}
          <div className="ka-health">
            <div className="ka-health-meta">
              <span className="ka-hm-lab">Health</span>
              <span className={`ka-hm-state ${liveHealth.cls}`}>{liveHealth.state}</span>
            </div>
            <div className="ka-health-ring">
              <Ring size={52} frac={liveHealth.health / 100} color={healthColor} strokeW={4} />
              <span className="ka-hr-num tabular">{liveHealth.health}</span>
            </div>
          </div>
        </div>
        <div className="ka-th-stats">
          <Stat lab="Active" val={activeCount} />
          <Stat lab="At risk" val={risk} cls={risk ? "is-risk" : ""} />
          <Stat lab="Late" val={late} cls={late ? "is-alert" : ""} />
          <Stat lab="Ready" val={ready} cls={ready ? "is-good" : ""} />
          <Stat lab="On shift" val={tile.onShift} />
          <div className="ka-th-spark">
            <span className="ka-sp-lab">{tile.throughputHr} / hr</span>
            <Sparkline points={tile.throughputSeries} color={healthColor} />
          </div>
        </div>
        {/* Pace head — covers/hr, revenue/hr, capacity bottleneck meter */}
        <div className="ka-pace-head">
          <div className="ka-pace-rate">
            <span className="lab">Covers / hr</span>
            <span className="val tabular">{tile.coversHr}</span>
          </div>
          <div className="ka-pace-rate">
            <span className="lab">Revenue / hr</span>
            <span className="val tabular">{zl(tile.revenueHr)}</span>
          </div>
          <div className="ka-cap-meter">
            <div className="ka-cm-top">
              <span className="ka-cm-lab">Capacity · bottleneck</span>
              <span className={`ka-cm-pct ${bottleneck?.tier ?? ""}`}>{bottleneck ? `${bottleneck.pct}%` : "—"}</span>
            </div>
            <div className="ka-cap-track">
              <span
                className={`ka-cap-fill ${bottleneck?.tier ?? "calm"}`}
                style={{ width: `${bottleneck ? Math.min(100, (bottleneck.pct / 100 / maxUtil) * 100) : 0}%` }}
              />
              <span className="ka-cap-mark" style={{ left: `${markLeft}%` }} title="100% capacity" />
            </div>
            <div className="ka-cm-foot">
              <span className={`ka-cm-station ${bottleneck?.tier ?? ""}`}>
                <span className="ka-dotb" />
                {bottleneck ? bottleneck.label : "Within capacity"}
              </span>
              <span className={`ka-cm-hint ${bottleneck?.tier === "risk" ? "risk" : ""}`}>
                {bottleneck?.tier === "risk"
                  ? "predicted to fall behind"
                  : bottleneck?.tier === "warn"
                    ? "nearing capacity"
                    : "within capacity"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pace gauges — per station */}
      <div className="ka-pace-gauges">
        <span className="ka-pg-title">Pace · next {paceWindowMin}m</span>
        {tile.stations.map((s) => {
          const util = Number.isFinite(s.pct) ? s.pct / 100 : maxUtil;
          return (
            <div className={`ka-gauge ${s.tier}`} key={s.id}>
              <div className="ka-g-top">
                <span className="ka-g-name">{s.label}</span>
                <span className={`ka-g-pct ${s.tier === "calm" ? "" : s.tier}`}>{s.pct}%</span>
              </div>
              <div className="ka-g-track">
                <span className={`ka-g-fill ${s.tier}`} style={{ width: `${Math.min(100, (util / maxUtil) * 100)}%` }} />
                <span className="ka-g-mark" style={{ left: `${markLeft}%` }} />
              </div>
              <div className="ka-g-foot">
                <span className="ka-g-fig tabular">
                  {s.demand}/{s.capacity}
                </span>
                <span className={`ka-g-fc ${s.tier === "risk" ? "risk" : ""}`}>
                  +{s.forecast} / {paceWindowMin}m
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ticket stack */}
      <div className="ka-tbody">
        {visible.length === 0 ? (
          <div className="ka-empty">No tickets in this view.</div>
        ) : (
          visible.map((t) => (
            <KdsTicketCard
              key={t.id}
              t={t}
              now={now}
              tone={toneOf(t)}
              station={station}
              advancing={advancingId === t.id}
              onAdvance={onAdvance}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Stat({ lab, val, cls = "" }: { lab: string; val: number; cls?: string }) {
  return (
    <div className={`ka-th-stat ${cls}`}>
      <span className="lab">{lab}</span>
      <span className="val tabular">{val}</span>
    </div>
  );
}

