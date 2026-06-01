"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChefHat, ChevronLeft, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import type { MenuCategory, OrderStatus } from "@/data/types";
import { formatPricePLN } from "@/lib/utils";
import { fulfillmentLabel } from "@/lib/fulfillment";
import { useToast } from "./v2/ui/Toast";
import { ticketTone, computeHealth, type PaceTier, type TicketTone } from "@/lib/kds-prediction";
import { Ring } from "./kds/KdsTicketCard";
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

// Compact złoty for the dense fleet tiles — the mockup's Revenue figures read
// "3.1k/hr", and a full "1 800,00 zł" would overflow the 25px stat. Thousands
// collapse to "1,8k zł"; anything under 1k keeps the exact formatted price.
function zl(grosze: number): string {
  const z = grosze / 100;
  if (Math.abs(z) >= 1000) {
    const k = z / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1).replace(".", ",")}k zł`;
  }
  return formatPricePLN(grosze);
}

const TONE_ORDER: Record<TicketTone, number> = { late: 0, risk: 1, warn: 2, firing: 3, queued: 4, ready: 5 };

/* ============================ SVG bits ============================ */

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return <span className="sparkbox" aria-hidden />;
  const w = 64; const h = 26;
  const max = Math.max(...points, 1); const min = Math.min(...points, 0);
  const span = max - min || 1; const step = w / (points.length - 1);
  const pts = points.map((p, i) => `${(i * step).toFixed(1)} ${(h - 2 - ((p - min) / span) * (h - 6)).toFixed(1)}`);
  const line = `M${pts.join(" L ")}`;
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="sparkbox" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ============================ Component ============================ */

export function AdminKdsFleet({ onDrillIn }: { onDrillIn?: (slug: string, lens?: "floor" | "chef") => void }) {
  const toast = useToast();
  // The sandbox simulator is a global setting, so the fleet wall flags it the
  // same way the floor board does (the fleet feed opts into simulated tickets).
  const { enabled: simEnabled } = useKdsSimulator(null);
  const [data, setData] = useState<FleetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Gate the loading-pill portal on a client mount so the SSR pass (where
  // `loading` is true but `document` doesn't exist) doesn't reach for
  // document.body, and so the first client render matches the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [now, setNow] = useState(() => Date.now());
  const { active: fullscreen, enter: enterFs, exit: exitFs } = useFullscreen();
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
    <div className={`kds-core${fullscreen ? " is-fullscreen" : ""}`}>
      <div className="kds-wrap">
        <div className="kds-top">
          <div className="kds-id">
            <div className="brand-mark">SI</div>
            <div>
              <div className="nm">Fleet Command</div>
              <div className="loc">Atlas · all trucks</div>
            </div>
          </div>
          <div className="kds-viewswitch">
            <button type="button" className="on">Fleet</button>
            <button
              type="button"
              disabled={!data?.tiles[0]}
              onClick={() => data?.tiles[0] && onDrillIn?.(data.tiles[0].slug, "floor")}
            >
              Floor
            </button>
            <button
              type="button"
              disabled={!data?.tiles[0]}
              onClick={() => data?.tiles[0] && onDrillIn?.(data.tiles[0].slug, "chef")}
            >
              Chef
            </button>
          </div>
          {simEnabled && (
            <span className="kds-badge platinum">
              <span className="d" />
              Sandbox
            </span>
          )}
          <div className="kds-clock" style={{ marginLeft: "auto" }}>{clock}</div>
          <a href="/admin" className="kds-ctrl" title="Back to admin">
            <ChevronLeft className="h-4 w-4" />
          </a>
          <button type="button" className="kds-ctrl" onClick={() => void load()} title="Refresh now">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`kds-ctrl${fullscreen ? " on" : ""}`}
            onClick={fullscreen ? exitFs : enterFs}
            title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen fleet wall"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {data && <FleetBar data={data} now={now} toneOf={toneOf} />}

        {loading && !data ? (
          // The loading pill is portaled to <body> below (not rendered here):
          // inside .kds-core / .admin-bg the shell's stacking context traps the
          // fixed pill (rule #4), so it never reaches the viewport bottom-center
          // like every other admin tab. The wall stays empty until the first
          // frame lands — error and "no active trucks" remain .fleet-empty
          // messages since those are content, not a transient load.
          null
        ) : error && !data ? (
          <div className="fleet-empty">Couldn’t load fleet — {error}</div>
        ) : data && data.tiles.length === 0 ? (
          <div className="fleet-empty">No active trucks. Activate a location to see it here.</div>
        ) : (
          <div className="trucks">
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
    </div>
  );

  // The loading pill rides the same escape hatch as the fullscreen wall, but
  // lands on the admin layout wrapper (`#admin-portal-root`) rather than
  // <body>: it's an ancestor of .admin-bg (so the pill escapes the
  // `.admin-bg > *` stacking trap) yet it holds the `--font-admin-*` next/font
  // vars, so `.v2-page-loading`'s `font-family: var(--font-ui)` resolves to
  // Inter. `.v2-shell` is gone on this core route and <body> sits outside the
  // font scope (browser default serif), so neither works. Fall back to <body>.
  return (
    <>
      {fullscreen ? createPortal(board, document.body) : board}
      {loading &&
        !data &&
        mounted &&
        createPortal(
          <div className="v2-page-loading">Loading Kitchen Display…</div>,
          document.getElementById("admin-portal-root") ?? document.body,
        )}
    </>
  );
}

function mmssF(seconds: number): string {
  const a = Math.abs(Math.round(seconds));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
function paceClass(tier?: PaceTier | null): string {
  return tier === "risk" ? "riskp" : tier === "warn" ? "warnp" : "calm";
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

  return (
    <>
      <div className="cmdbar">
        <div className="cstat">
          <div className="l">Active</div>
          <div className="v">{active}</div>
          <div className="s">{ready} ready for expo</div>
        </div>
        <div className="cstat risk">
          <div className="l">At risk</div>
          <div className="v">{risk}</div>
          <div className="s">predicted miss</div>
        </div>
        <div className="cstat late">
          <div className="l">Late</div>
          <div className="v">{late}</div>
          <div className="s">over SLA</div>
        </div>
        <div className="cstat ready">
          <div className="l">Ready</div>
          <div className="v">{ready}</div>
          <div className="s">for expo</div>
        </div>
        <div className="cstat">
          <div className="l">Throughput</div>
          <div className="v">
            {totals.throughputHr}
            <span className="u">/hr</span>
          </div>
          <div className="s">last 60 min</div>
        </div>
        <div className="cstat">
          <div className="l">Covers</div>
          <div className="v">
            {totals.coversHr}
            <span className="u">/hr</span>
          </div>
        </div>
        <div className="cstat">
          <div className="l">Revenue</div>
          <div className="v">
            {zl(totals.revenueHr)}
            <span className="u">/hr</span>
          </div>
        </div>
      </div>

      <div className="bench">
        <div className="h">
          <span className="ttl">Promise-accuracy · cross-truck benchmark</span>
          <span className="sub">
            fleet <b>{benchmark.fleetAccuracy}%</b> · target {promiseTarget}%
          </span>
        </div>
        {data.tiles.map((t) => {
          const isLeader = t.name === benchmark.leader && data.tiles.length > 1 && benchmark.gap > 0;
          const color =
            t.promiseAccuracy >= promiseTarget
              ? "var(--ready)"
              : t.promiseAccuracy >= promiseTarget - 5
                ? "var(--warn)"
                : "var(--late)";
          return (
            <div className="brow" key={t.slug}>
              <span className="city">
                {t.name}
                {isLeader && <span className="lead">Lead</span>}
              </span>
              <span className="btrack">
                <i style={{ width: `${t.promiseAccuracy}%`, background: color }} />
                <span className="mark" style={{ left: `${promiseTarget}%` }} title={`target ${promiseTarget}%`} />
              </span>
              <span className="pct">{t.promiseAccuracy}%</span>
            </div>
          );
        })}
      </div>
    </>
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
  onDrillIn?: (slug: string, lens?: "floor" | "chef") => void;
}) {
  void advancingId;
  void onAdvance;
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
      ? "var(--late)"
      : liveHealth.cls === "risk"
        ? "var(--risk)"
        : liveHealth.cls === "warn"
          ? "var(--warn)"
          : "var(--ready)";

  const visible = [...tile.tickets].sort((a, b) => {
    const d = TONE_ORDER[toneOf(a)] - TONE_ORDER[toneOf(b)];
    if (d !== 0) return d;
    return (a.promisedReadyAtMs ?? Infinity) - (b.promisedReadyAtMs ?? Infinity);
  });

  const maxUtil = Math.max(1.5, ...tile.stations.map((s) => (Number.isFinite(s.pct) ? s.pct / 100 : 1.5)));
  const markLeft = (1 / maxUtil) * 100;
  const bottleneck = tile.bottleneck;

  return (
    <div className="truck">
      <div className="thead">
        <button
          type="button"
          className="thead-open"
          onClick={onDrillIn ? () => onDrillIn(tile.slug, "floor") : undefined}
          title={onDrillIn ? `Open ${tile.name}'s floor board` : undefined}
        >
          <div className="ring">
            <Ring size={54} frac={liveHealth.health / 100} color={healthColor} strokeW={4} />
            <span className="sc">
              <b style={{ color: healthColor }}>{liveHealth.health}</b>
            </span>
          </div>
          <div>
            <div className="city">{tile.name}</div>
            <div className="open">
              Open · {activeCount} active ·{" "}
              <span className="health-state" style={{ color: healthColor }}>
                {liveHealth.state}
              </span>
            </div>
          </div>
          {onDrillIn && <span className="drill">Open floor →</span>}
        </button>
        {onDrillIn && (
          <button
            type="button"
            className="drill-chef"
            onClick={() => onDrillIn(tile.slug, "chef")}
            title={`Open ${tile.name}'s chef line`}
          >
            <ChefHat width={14} height={14} />
            Chef line →
          </button>
        )}
      </div>

      <div className="trow2">
        <div className="tcell">
          <div className="l">Active</div>
          <div className="v">{activeCount}</div>
        </div>
        <div className={`tcell${risk ? " risk" : ""}`}>
          <div className="l">At risk</div>
          <div className="v">{risk}</div>
        </div>
        <div className={`tcell${late ? " late" : ""}`}>
          <div className="l">Late</div>
          <div className="v">{late}</div>
        </div>
        <div className={`tcell${ready ? " ready" : ""}`}>
          <div className="l">Ready</div>
          <div className="v">{ready}</div>
        </div>
        <div className="tcell">
          <div className="l">On shift</div>
          <div className="v">{tile.onShift}</div>
        </div>
      </div>

      <div className="pacehead">
        <div className="met">
          <div className="l">Covers / hr</div>
          <div className="v">{tile.coversHr}</div>
        </div>
        <div className="met">
          <div className="l">Revenue / hr</div>
          <div className="v">{zl(tile.revenueHr)}</div>
        </div>
        <Sparkline points={tile.throughputSeries} color={healthColor} />
        <div className="capmeter">
          <div className="lbl">
            <span>Capacity · {bottleneck ? bottleneck.label : "within capacity"}</span>
            <span className="hint">{bottleneck ? `${bottleneck.pct}%` : ""}</span>
          </div>
          <div className={`cmtrack ${paceClass(bottleneck?.tier)}`}>
            <i style={{ width: `${bottleneck ? Math.min(100, (bottleneck.pct / 100 / maxUtil) * 100) : 0}%` }} />
            <span className="m100" style={{ left: `${markLeft}%` }} title="100% capacity" />
          </div>
        </div>
      </div>

      <div className="gauges">
        <div className="gh">Pace · next {paceWindowMin}m</div>
        {tile.stations.map((s) => {
          const util = Number.isFinite(s.pct) ? s.pct / 100 : maxUtil;
          return (
            <div className="grow" key={s.id}>
              <span className="gn">{s.label}</span>
              <span className={`gtrack ${paceClass(s.tier)}`}>
                <i style={{ width: `${Math.min(100, (util / maxUtil) * 100)}%` }} />
                <span className="m100" style={{ left: `${markLeft}%` }} />
              </span>
              <span className="gf">
                {s.demand}/{s.capacity} · +{s.forecast}
              </span>
            </div>
          );
        })}
      </div>

      <div className="stack">
        {visible.length === 0 ? (
          <div className="fleet-empty" style={{ padding: 20 }}>No tickets in this view.</div>
        ) : (
          visible.map((t) => {
            const tone = toneOf(t);
            const mt = t.status === "ready" ? "ready" : tone === "late" ? "late" : tone === "risk" ? "risk" : tone === "warn" ? "warn" : "";
            const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
            return (
              <div className={`mt ${mt}`} key={t.id}>
                <span className="mid">#{t.shortId}</span>
                <span className="mty">{fulfillmentLabel(t.fulfillmentType)}</span>
                <span className="mnm">{t.items[0]?.name ?? t.customerName}</span>
                {tone === "risk" && t.status !== "ready" && <span className="riskpill">at risk</span>}
                <span className="mtimer">{t.status === "ready" ? "plated" : mmssF(elapsed)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
