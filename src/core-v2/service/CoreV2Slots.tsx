"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import type { TimeSlot } from "@/data/types";
import { serviceTabs } from "./serviceTabs";

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
    </CoreV2Shell>
  );
}
