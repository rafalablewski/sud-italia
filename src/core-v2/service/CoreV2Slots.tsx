"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import type { FulfillmentType, TimeSlot } from "@/data/types";
import { serviceTabs } from "./serviceTabs";

const FULFIL: { key: FulfillmentType; label: string }[] = [
  { key: "dine-in", label: "Dine-in" },
  { key: "takeout", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];

interface DemandSlotRow {
  slotId: string;
  time: string;
  maxOrders: number;
  currentOrders: number;
  predictedDemand: number;
  tier: "under" | "healthy" | "tight" | "over" | "kitchen-capped";
  recommendedMaxOrders: number;
  minSpendGrosze: number;
  recommendedMinSpendGrosze: number;
  action: "raise" | "trim" | "protect" | "hold";
  missedDemand: number;
  note: string;
}
interface DemandBoard {
  date: string;
  kitchenCoversPerHour: number | null;
  slots: DemandSlotRow[];
  summary: { predictedCovers: number; fillForecastPct: number; missedDemand: number };
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const zl = (g: number) => (g / 100).toFixed(0);

/**
 * Core v2 · Service · Slots — capacity + the Demand Exchange, wired to today's
 * /core/service/slots engine: GET /api/admin/slots (capacity) +
 * /api/admin/demand-exchange (forecast). Toggle active/draft (PUT slots), apply
 * a demand lever (POST demand-exchange single / apply-all). Own cv- UI.
 */
export function CoreV2Slots() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  const [date, setDate] = useState(todayLocal());
  const [tab, setTab] = useState<"manage" | "demand">("manage");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [board, setBoard] = useState<DemandBoard | null>(null);
  const [acting, setActing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cStart, setCStart] = useState("18:00");
  const [cEnd, setCEnd] = useState("21:00");
  const [cInterval, setCInterval] = useState("30");
  const [cMax, setCMax] = useState("16");
  const [cFulfil, setCFulfil] = useState<Set<FulfillmentType>>(new Set(["dine-in"]));

  const loadSlots = useCallback(async () => {
    const r = await fetch(`/api/admin/slots?location=${encodeURIComponent(loc)}&date=${date}`);
    const d = r.ok ? await r.json() : [];
    setSlots(Array.isArray(d) ? d : d.slots ?? []);
  }, [loc, date]);
  const loadBoard = useCallback(async () => {
    const r = await fetch(`/api/admin/demand-exchange?location=${encodeURIComponent(loc)}&date=${date}`);
    const d = r.ok ? await r.json() : null;
    setBoard(d?.board ?? null);
  }, [loc, date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);
  useEffect(() => {
    if (tab === "demand") void loadBoard();
  }, [tab, loadBoard]);

  const ordered = useMemo(() => [...slots].sort((a, b) => a.time.localeCompare(b.time)), [slots]);
  const kpis = useMemo(() => {
    const cap = slots.reduce((s, x) => s + x.maxOrders, 0);
    const booked = slots.reduce((s, x) => s + x.currentOrders, 0);
    const peak = Math.max(0, ...slots.map((x) => (x.maxOrders ? x.currentOrders / x.maxOrders : 0)));
    const mult = peak >= 0.85 ? "1.2×" : peak >= 0.7 ? "1.1×" : "1.0×";
    return [
      { l: "Slots", v: String(slots.length) },
      { l: "Booked", v: String(booked) },
      { l: "Fill rate", v: cap ? `${Math.round((booked / cap) * 100)}%` : "—" },
      { l: "Demand price", v: mult },
    ];
  }, [slots]);

  const toggleSlot = async (slot: TimeSlot) => {
    if (acting) return;
    setActing(true);
    try {
      const next = slot.status === "active" ? "draft" : "active";
      const r = await fetch("/api/admin/slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: slot.id, status: next }),
      });
      if (r.ok) {
        setSlots((xs) => xs.map((x) => (x.id === slot.id ? { ...x, status: next } : x)));
      } else toast("Could not update slot", "danger");
    } finally {
      setActing(false);
    }
  };

  const createSlots = async () => {
    const fulfil = [...cFulfil];
    const interval = parseInt(cInterval, 10);
    const maxOrders = parseInt(cMax, 10);
    if (fulfil.length === 0 || !Number.isFinite(interval) || !Number.isFinite(maxOrders)) {
      toast("Pick a channel + valid interval/capacity", "danger");
      return;
    }
    setActing(true);
    try {
      const r = await fetch("/api/admin/slots?bulk=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationSlug: loc,
          date,
          fulfillmentTypes: fulfil,
          bulk: { startTime: cStart, endTime: cEnd, interval },
          maxOrders,
          status: "active",
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const n = Array.isArray(d) ? d.length : 1;
        toast(`Created ${n} slot${n === 1 ? "" : "s"}`, "success");
        setCreateOpen(false);
        await loadSlots();
      } else toast((d as { error?: string }).error || "Could not create slots", "danger");
    } finally {
      setActing(false);
    }
  };
  const deleteSlot = async (slot: TimeSlot) => {
    if (acting) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/slots?id=${encodeURIComponent(slot.id)}`, { method: "DELETE" });
      if (r.ok) {
        setSlots((xs) => xs.filter((x) => x.id !== slot.id));
        toast(`${slot.time} slot deleted`, "success");
      } else toast("Could not delete", "danger");
    } finally {
      setActing(false);
    }
  };

  const applyOne = async (row: DemandSlotRow) => {
    if (acting) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/demand-exchange?location=${encodeURIComponent(loc)}&date=${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: row.slotId, maxOrders: row.recommendedMaxOrders, minSpendGrosze: row.recommendedMinSpendGrosze }),
      });
      if (r.ok) {
        toast(`${row.time} → ${row.recommendedMaxOrders} covers`, "success");
        await Promise.all([loadBoard(), loadSlots()]);
      } else toast("Could not apply", "danger");
    } finally {
      setActing(false);
    }
  };
  const applyAll = async () => {
    if (acting) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/demand-exchange?location=${encodeURIComponent(loc)}&date=${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply-all" }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast(`Applied ${d.applied ?? "all"} levers`, "success");
        await Promise.all([loadBoard(), loadSlots()]);
      } else toast("Could not apply", "danger");
    } finally {
      setActing(false);
    }
  };

  const changeCount = board?.slots.filter((r) => r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze).length ?? 0;

  return (
    <CoreV2Shell
      eyebrow="Service · Floor & Slots"
      tabs={serviceTabs("slots")}
      subRight={
        <>
          <div className="cv-seg">
            <button className={tab === "manage" ? "on" : ""} onClick={() => setTab("manage")}>Manage</button>
            <button className={tab === "demand" ? "on" : ""} onClick={() => setTab("demand")}>Demand</button>
          </div>
          {tab === "manage" && (
            <button type="button" className="cv-chip" style={{ height: 32 }} onClick={() => setCreateOpen(true)}>+ New</button>
          )}
          <input className="cv-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ height: 32 }} />
        </>
      }
    >
      <div className="cv-guest-inbox">
        {tab === "manage" ? (
          <>
            <div className="cv-kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {kpis.map((k) => (
                <div className="k" key={k.l}><div className="kl">{k.l}</div><div className="kv mono">{k.v}</div></div>
              ))}
            </div>
            <div className="cv-crm-table-wrap" style={{ padding: 16 }}>
              {ordered.length === 0 ? (
                <div className="cv-kds-empty pad">No slots for this day.</div>
              ) : (
                <div className="cv-slot-list">
                  {ordered.map((s) => {
                    const pct = s.maxOrders ? Math.round((s.currentOrders / s.maxOrders) * 100) : 0;
                    return (
                      <div key={s.id} className={`cv-slot ${s.status === "draft" ? "draft" : ""}`}>
                        <span className="st mono">{s.time}</span>
                        <div className="bar"><div className="fill" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 85 ? "var(--danger)" : pct >= 70 ? "var(--amber)" : "var(--basil)" }} /></div>
                        <span className="cap mono">{s.currentOrders}/{s.maxOrders}</span>
                        <span className="ch">{s.fulfillmentTypes.join(" · ")}</span>
                        <button className={`cv-pill-btn ${s.status}`} onClick={() => void toggleSlot(s)}>{s.status}</button>
                        <button className="cv-slot-x" title="Delete slot" onClick={() => void deleteSlot(s)} aria-label="Delete slot">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {board && (
              <div className="cv-demand-head">
                <span className="cv-cust-sub">~{board.summary.predictedCovers} covers · {Math.round(board.summary.fillForecastPct)}% fill · {board.summary.missedDemand} walked{board.kitchenCoversPerHour ? ` · kitchen ${board.kitchenCoversPerHour}/hr` : ""}</span>
                {changeCount > 0 && <button className="cv-btn primary" disabled={acting} onClick={() => void applyAll()}>Apply all ({changeCount})</button>}
              </div>
            )}
            <div className="cv-crm-table-wrap">
              {!board ? (
                <div className="cv-kds-empty pad">Loading demand board…</div>
              ) : board.slots.length === 0 ? (
                <div className="cv-kds-empty pad">No slots to forecast for this day.</div>
              ) : (
                <table className="cv-tbl">
                  <thead>
                    <tr><th>Time</th><th>Tier</th><th className="num">Booked</th><th className="num">Forecast</th><th className="num">Cap → rec</th><th>Action</th><th></th></tr>
                  </thead>
                  <tbody>
                    {board.slots.map((r) => {
                      const changed = r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze;
                      return (
                        <tr key={r.slotId} title={r.note}>
                          <td className="mono">{r.time}</td>
                          <td><span className={`cv-tier-d ${r.tier}`}>{r.tier}</span></td>
                          <td className="num mono">{r.currentOrders}</td>
                          <td className="num mono">{r.predictedDemand}</td>
                          <td className="num mono">{r.maxOrders}{changed ? ` → ${r.recommendedMaxOrders}` : ""}{r.recommendedMinSpendGrosze > 0 ? ` · min ${zl(r.recommendedMinSpendGrosze)}` : ""}</td>
                          <td><span className={`cv-act ${r.action}`}>{r.action}</span></td>
                          <td>{changed && <button className="cv-btn sm" disabled={acting} onClick={() => void applyOne(r)}>Apply</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <CoreV2Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`New slots · ${date}`}
        footer={
          <>
            <button className="cv-btn ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="cv-btn primary" disabled={acting} onClick={() => void createSlots()}>Create</button>
          </>
        }
      >
        <div className="cv-slot-create">
          <label>Channels
            <div className="cv-segs" style={{ marginTop: 6 }}>
              {FULFIL.map((f) => (
                <button
                  key={f.key}
                  className={cFulfil.has(f.key) ? "on" : ""}
                  onClick={() =>
                    setCFulfil((s) => {
                      const n = new Set(s);
                      if (n.has(f.key)) n.delete(f.key);
                      else n.add(f.key);
                      return n;
                    })
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </label>
          <div className="cv-slot-create-grid">
            <label>Start<input className="cv-inp" type="time" value={cStart} onChange={(e) => setCStart(e.target.value)} /></label>
            <label>End<input className="cv-inp" type="time" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></label>
            <label>Every (min)<input className="cv-inp" value={cInterval} onChange={(e) => setCInterval(e.target.value)} /></label>
            <label>Capacity<input className="cv-inp" value={cMax} onChange={(e) => setCMax(e.target.value)} /></label>
          </div>
          <p className="cv-cust-sub">Generates active slots from {cStart} to {cEnd} every {cInterval} min, {cMax} covers each.</p>
        </div>
      </CoreV2Dialog>
    </CoreV2Shell>
  );
}
