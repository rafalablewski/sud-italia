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
import { SectionEyebrow } from "./command";
import { useFullscreen } from "./command/useFullscreen";
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
  const { active: fullscreen, enter: enterFs, exit: exitFs } = useFullscreen();
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [simBusy, setSimBusy] = useState(false);
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

  // Sandbox controls, fleet edition. The floor board stages a rush on one
  // truck; from the fleet wall the owner stages it across the whole fleet, so
  // Add spawns the marked SIMULATION tickets into every live truck at once and
  // Purge clears them everywhere. No-ops cleanly when no trucks are live.
  const simSpawn = useCallback(
    async (count: number) => {
      const tiles = data?.tiles ?? [];
      if (tiles.length === 0) return;
      setSimBusy(true);
      try {
        const results = await Promise.all(
          tiles.map((t) =>
            fetch(`/api/admin/kds-simulator?location=${encodeURIComponent(t.slug)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "spawn", count }),
            }).then((r) => r.ok),
          ),
        );
        if (results.some((ok) => !ok)) {
          toast.error("Couldn't add sandbox tickets", "Check the simulator is enabled in Settings.");
        }
      } catch {
        toast.error("Couldn't add sandbox tickets", "Network error — try again.");
      } finally {
        setSimBusy(false);
        void load();
      }
    },
    [data, load, toast],
  );

  const simPurge = useCallback(async () => {
    setSimBusy(true);
    try {
      await fetch("/api/admin/kds-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge" }),
      });
    } catch {
      /* non-fatal — the next poll reconciles */
    } finally {
      setSimBusy(false);
      void load();
    }
  }, [load]);

  // 1 s tick drives live timers + tone thresholds (the predictive tier shifts
  // across the SLA boundary in real time, between server polls).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const clock = useMemo(() => fmtWallClock(now), [now]);

  const board = (
    <div className={`kds-atlas${fullscreen ? " is-fullscreen" : ""}`}>
      {/* ---------------- Header ---------------- */}
      <header className="cmd-head">
        <div className="cmd-brand">
          <span className="cmd-wordmark">SUD ITALIA</span>
          <span className="cmd-label">Fleet command</span>
          {simEnabled && <span className="ka-sandbox">Sandbox</span>}
        </div>
        <div className="cmd-spacer" />
        <button type="button" className="cmd-btn" onClick={() => void load()} title="Refresh now">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
        <button
          type="button"
          className="cmd-btn"
          onClick={fullscreen ? exitFs : enterFs}
          aria-pressed={fullscreen}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen fleet wall"}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span>{fullscreen ? "Exit" : "Fullscreen"}</span>
        </button>
        <div className="cmd-clock tabular">{clock}</div>
      </header>

      {/* Sandbox controls live on a strip under the shared header (not in it). */}
      {simEnabled && (
        <div className="cmd-subbar" role="group" aria-label="Sandbox controls">
          <button type="button" className="cmd-btn" disabled={simBusy} onClick={() => void simSpawn(1)} title="Add 1 sandbox ticket to every live truck">
            Add 1
          </button>
          <button type="button" className="cmd-btn" disabled={simBusy} onClick={() => void simSpawn(5)} title="Add 5 sandbox tickets to every live truck">
            Add 5
          </button>
          <button type="button" className="cmd-btn" disabled={simBusy} onClick={() => void simPurge()} title="Clear all sandbox tickets across the fleet">
            Purge
          </button>
        </div>
      )}

      {/* ---------------- Fleet command bar ---------------- */}
      {data && (
        <FleetBar
          data={data}
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
              toneOf={toneOf}
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
      <SectionEyebrow icon={<MapPin className="h-3 w-3" />} label="Fleet command">
        <b>{data.tiles.length}</b> {data.tiles.length === 1 ? "truck" : "trucks"} live
      </SectionEyebrow>
      <KdsStatGrid stats={stats} />
      <div className="ka-fb-benchmark">
        <span className="ka-fb-bm-lab">Promise-accuracy · cross-truck benchmark</span>
        <div className="ka-bm-rows">
          {data.tiles.map((t) => {
            // Only crown a leader when there's an actual margin — a tied fleet
            // has no leader (otherwise we'd badge "Lead" on a 0-pt gap).
            const isLeader = t.name === benchmark.leader && data.tiles.length > 1 && benchmark.gap > 0;
            const color =
              t.promiseAccuracy >= promiseTarget
                ? "var(--cmd-ready)"
                : t.promiseAccuracy >= promiseTarget - 5
                  ? "var(--cmd-warn)"
                  : "var(--cmd-late)";
            return (
              <div className="ka-bm-row" key={t.slug}>
                <span className="ka-bm-name">
                  <span className="ka-bm-name-text">{t.name}</span>
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
          {benchmark.gap > 0 && benchmark.leader && benchmark.lagger && benchmark.leader !== benchmark.lagger ? (
            <>
              {" — "}
              <b style={{ color: "var(--cmd-ready)" }}>{benchmark.leader}</b> leads {benchmark.lagger} by {benchmark.gap} pts
            </>
          ) : (
            <> — all trucks level</>
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
  toneOf,
  advancingId,
  onAdvance,
  onDrillIn,
}: {
  tile: WireTile;
  now: number;
  paceWindowMin: number;
  toneOf: (t: WireTicket) => TicketTone;
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
      ? "var(--cmd-late)"
      : liveHealth.cls === "risk"
        ? "var(--cmd-risk)"
        : liveHealth.cls === "warn"
          ? "var(--cmd-warn)"
          : "var(--cmd-ready)";

  const visible = [...tile.tickets].sort((a, b) => {
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
              station="all"
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

