"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "@/shared/LocationContext";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import { analyzeTruck } from "@/lib/kds-prediction";
import { buildKdsTicket, type KdsTicket } from "@/lib/kds-ticket";
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
 * Core v2 · KDS — the always-dark kitchen wall, wired to the live order stream.
 * Floor (New → Firing → Ready·Expo lanes) + Chef (station make-queue) run off
 * the same engine as today's /core/kds: useAdminOrdersStream → analyzeTruck →
 * buildKdsTicket → groupTicketsByColumn, bump via PUT /api/admin/orders. Fleet
 * pulls /api/admin/kds/fleet (owner). The wall stays dark regardless of theme.
 */
export function CoreV2Kds() {
  const { location, setLocation } = useLocation();
  const toast = useCoreToast();
  const [view, setView] = useState<View>("floor");
  const [station, setStation] = useState<MenuCategory | "all">("all");
  const [lane, setLane] = useState<OrderStatus | "all">("all");
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const { orders, refresh } = useAdminOrdersStream(location, { paused, includeSimulated: true });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.role && setRole(j.role))
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

  const advance = useCallback(
    async (t: KdsTicket) => {
      const next = nextStatus(t.status);
      if (!next || updatingId) return;
      setUpdatingId(t.id);
      try {
        const res = await fetch(`/api/admin/orders`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: t.id, status: next }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          toast(d.error || "Could not bump ticket", "danger");
          return;
        }
        refresh();
      } finally {
        setUpdatingId(null);
      }
    },
    [updatingId, refresh, toast],
  );

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

  const isOwner = role === "owner";
  const tabs = [
    ...(isOwner ? [{ label: "Fleet", active: view === "fleet", onClick: () => setView("fleet") }] : []),
    { label: "Floor", active: view === "floor", onClick: () => setView("floor") },
    { label: "Chef", active: view === "chef", onClick: () => setView("chef") },
  ];

  const ticketCard = (t: KdsTicket) => {
    const due = dueLabel(t, now);
    const pct = slaPct(t, now);
    return (
      <div key={t.id} className={`cv-tk t-${due.tone}`}>
        <div className="cv-tk-h">
          <span className="id">
            #{t.shortId}
            <span className="chiplet">{channelTag(t)}</span>
          </span>
          <span className={`due t-${due.tone}`}>{due.text}</span>
        </div>
        <div className="cv-tk-items">
          {t.items.map((it, i) => {
            const dim = station !== "all" && it.category !== station;
            return (
              <div key={i} className={dim ? "it dim" : "it"}>
                <span className="q">{it.quantity}×</span>
                <span className="nm">{it.name}</span>
                {it.notes && <span className="mod">{it.notes}</span>}
              </div>
            );
          })}
        </div>
        <div className="cv-meter">
          <i style={{ width: `${pct}%` }} className={`t-${due.tone}`} />
        </div>
        {nextStatus(t.status) && (
          <button type="button" className="cv-bump" disabled={updatingId === t.id} onClick={() => void advance(t)}>
            {BUMP_LABEL[t.status]}
          </button>
        )}
      </div>
    );
  };

  return (
    <CoreV2Shell
      eyebrow={`Kitchen Display · ${location || "all trucks"}`}
      tabs={tabs}
      bleed
      subRight={
        view === "fleet" ? null : (
          <>
            <div className="cv-seg">
              <button className={lane === "all" ? "on" : ""} onClick={() => setLane("all")}>
                All <b>{counts.all}</b>
              </button>
              {KDS_COLUMNS.map((c) => (
                <button key={c.id} className={lane === c.id ? "on" : ""} onClick={() => setLane(c.id)}>
                  {c.label.split(" ")[0]} <b>{counts[c.id]}</b>
                </button>
              ))}
            </div>
            <button type="button" className="cv-iconbtn" title={paused ? "Resume" : "Pause"} onClick={() => setPaused((p) => !p)}>
              {paused ? "▶" : "❚❚"}
            </button>
          </>
        )
      }
    >
      <div className="cv-kds">
        {view === "fleet" ? (
          <FleetWall fleet={fleet} now={now} onDrill={(slug) => { setLocation(slug); setView("floor"); }} />
        ) : (
          <>
            <div className="cv-kpi">
              <div className="k"><div className="kl">Open</div><div className="kv">{counts.all}</div></div>
              <div className="k"><div className="kl">New</div><div className="kv">{counts.confirmed}</div></div>
              <div className="k"><div className="kl">Firing</div><div className="kv i">{counts.preparing}</div></div>
              <div className="k"><div className="kl">Ready</div><div className="kv ok">{counts.ready}</div></div>
              <div className="k"><div className="kl">At risk</div><div className={counts.risk ? "kv warn" : "kv"}>{counts.risk}</div></div>
              <div className="k"><div className="kl">Late</div><div className={counts.late ? "kv bad" : "kv"}>{counts.late}</div></div>
            </div>

            {/* station strip (chef + floor) */}
            <div className="cv-stations">
              {stationsPresent.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={station === s.id ? "cv-stn on" : "cv-stn"}
                  onClick={() => setStation(s.id)}
                >
                  {s.id === "all" ? "All stations" : MENU_CATEGORY_LABELS[s.id as MenuCategory]}
                </button>
              ))}
            </div>

            {view === "chef" ? (
              <div className="cv-chefq">
                {allTickets.length === 0 ? (
                  <div className="cv-kds-empty">No active tickets.</div>
                ) : (
                  allTickets.map(ticketCard)
                )}
              </div>
            ) : lane === "all" ? (
              <div className="cv-lanes">
                {KDS_COLUMNS.map((col) => {
                  const ts = visibleByStatus.get(col.id) ?? [];
                  return (
                    <div key={col.id} className="cv-lane">
                      <div className="cv-lane-h">
                        <span className="lt">{col.label}</span>
                        <span className="lc">{ts.length}</span>
                      </div>
                      <div className="cv-lane-b">
                        {ts.length === 0 ? <div className="cv-kds-empty">—</div> : ts.map(ticketCard)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="cv-chefq">
                {(visibleByStatus.get(lane) ?? []).map(ticketCard)}
              </div>
            )}
          </>
        )}
      </div>
    </CoreV2Shell>
  );
}

// ---- Fleet (owner) ----
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
}
interface FleetWire {
  promiseTarget: number;
  benchmark: { fleetAccuracy: number; leader: string | null; gap: number };
  tiles: FleetTileWire[];
}

function FleetWall({ fleet, onDrill }: { fleet: FleetWire | null; now: number; onDrill: (slug: string) => void }) {
  if (!fleet) return <div className="cv-kds-empty pad">Loading fleet…</div>;
  return (
    <div className="cv-fleet">
      <div className="cv-fleet-bench">
        <span>Promise-accuracy · cross-truck benchmark</span>
        <span>
          fleet {Math.round(fleet.benchmark.fleetAccuracy)}% · target {fleet.promiseTarget}%
          {fleet.benchmark.leader ? ` · ${fleet.benchmark.leader} leads` : ""}
        </span>
      </div>
      <div className="cv-fleet-grid">
        {fleet.tiles.map((t) => (
          <div key={t.slug} className="cv-truck">
            <div className="cv-truck-h">
              <div className={`cv-ring ${t.healthClass}`}>{t.health}</div>
              <div className="cv-truck-id">
                <div className="nm">{t.name}</div>
                <div className="sub">
                  {t.counts.active} active · <b className={`h-${t.healthClass}`}>{t.healthState}</b> · {t.onShift} on shift
                </div>
              </div>
            </div>
            <div className="cv-truck-stats">
              <div><span className="sv">{t.counts.ready}</span><span className="sl">Ready</span></div>
              <div><span className={t.counts.risk ? "sv warn" : "sv"}>{t.counts.risk}</span><span className="sl">At risk</span></div>
              <div><span className={t.counts.late ? "sv bad" : "sv"}>{t.counts.late}</span><span className="sl">Late</span></div>
              <div><span className="sv">{t.throughputHr}</span><span className="sl">/hr</span></div>
              <div><span className="sv">{Math.round(t.promiseAccuracy)}%</span><span className="sl">Promise</span></div>
            </div>
            <button type="button" className="cv-truck-drill" onClick={() => onDrill(t.slug)}>
              Open floor →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
