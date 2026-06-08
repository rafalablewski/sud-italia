"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { FulfillmentType, TimeSlot } from "@/data/types";
import type { DemandAction, DemandBoard, DemandTier } from "@/lib/demand-exchange";
import { useToast } from "@/ui/Toast";

/**
 * Slots view — Core v2 (`.corev2`) re-skin of `src/core/service/SlotsView.tsx`.
 * Same behaviour, same endpoints, re-rendered in the core-suite visual
 * language (`.svc` body, `.slt-*` layout from styles/service.css, generic
 * `.seg`/`.btn`/`.badge`/`.tbl`/`.fchip`/`.input` primitives from core.css).
 * Manage tab = day/week slot capacity (toggle/delete + new-slot incl. bulk);
 * Demand tab = the Demand Exchange yield board (tier · recommendation · apply /
 * apply-all). The new-slot form is a portaled `.overlay`/`.dialog`.
 *
 * Endpoints (verbatim from v1):
 *   GET/POST/PUT/DELETE /api/admin/slots        · slot CRUD (single + ?bulk=1)
 *   GET/POST /api/admin/demand-exchange         · yield board · apply / apply-all
 */

const FULFILMENTS: FulfillmentType[] = ["takeout", "delivery", "dine-in"];
const TIER_TONE: Record<DemandTier, string> = {
  under: "info",
  healthy: "success",
  tight: "warning",
  over: "danger",
  "kitchen-capped": "danger",
};
const ACTION_LABEL: Record<DemandAction, string> = {
  raise: "Raise capacity",
  trim: "Trim / promote",
  protect: "Protect kitchen",
  hold: "Hold",
};
const zl0 = (g: number) => `${Math.round(g / 100)} zł`;

/** The 7 ISO dates (Mon→Sun) of the week containing `d`. */
function weekDates(d: string): string[] {
  const base = new Date(`${d}T00:00:00Z`);
  const monOffset = (base.getUTCDay() + 6) % 7; // Mon = 0
  const mon = base.getTime() - monOffset * 86_400_000;
  return Array.from({ length: 7 }, (_, i) => new Date(mon + i * 86_400_000).toISOString().slice(0, 10));
}
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function IcoRefresh() {
  return (
    <svg className="icn" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
    </svg>
  );
}
function IcoPlus() {
  return (
    <svg className="icn" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SlotsView({ loc, date }: { loc: string; date: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<"manage" | "demand">("manage");
  const [range, setRange] = useState<"day" | "week">("day");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [board, setBoard] = useState<DemandBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      // Week view needs the whole location's slots (grouped client-side); day
      // view scopes to the date.
      const url = range === "week" ? `/api/admin/slots?location=${loc}` : `/api/admin/slots?location=${loc}&date=${date}`;
      const r = await fetch(url);
      const j = r.ok ? await r.json() : [];
      setSlots(Array.isArray(j) ? j : []);
    } finally {
      setLoading(false);
    }
  }, [loc, date, range]);

  const loadDemand = useCallback(async () => {
    const r = await fetch(`/api/admin/demand-exchange?location=${loc}&date=${date}`);
    const j = r.ok ? await r.json() : null;
    setBoard((j?.board as DemandBoard) ?? null);
  }, [loc, date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);
  useEffect(() => {
    if (tab === "demand") void loadDemand();
  }, [tab, loadDemand]);

  const toggleStatus = async (slot: TimeSlot) => {
    setActing(slot.id);
    const next = slot.status === "active" ? "draft" : "active";
    const r = await fetch("/api/admin/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slot.id, status: next }),
    });
    setActing(null);
    if (r.ok) {
      toast.success(next === "active" ? "Slot activated" : "Slot drafted");
      await loadSlots();
    } else toast.error("Could not update slot");
  };

  const del = async (slot: TimeSlot) => {
    setActing(slot.id);
    const r = await fetch(`/api/admin/slots?id=${encodeURIComponent(slot.id)}`, { method: "DELETE" });
    setActing(null);
    if (r.ok) {
      toast.success("Slot deleted");
      await loadSlots();
    } else toast.error("Could not delete");
  };

  const applyDemand = async (slotId: string, maxOrders: number, minSpendGrosze: number) => {
    setActing(slotId);
    const r = await fetch(`/api/admin/demand-exchange?location=${loc}&date=${date}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, maxOrders, minSpendGrosze }),
    });
    setActing(null);
    if (r.ok) {
      toast.success("Applied");
      await Promise.all([loadDemand(), loadSlots()]);
    } else toast.error("Could not apply");
  };

  const applyAll = async () => {
    const r = await fetch(`/api/admin/demand-exchange?location=${loc}&date=${date}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "apply-all" }),
    });
    if (r.ok) {
      const j = (await r.json()) as { applied: number };
      toast.success("Applied", `${j.applied} slot(s)`);
      await Promise.all([loadDemand(), loadSlots()]);
    } else toast.error("Could not apply");
  };

  const changeCount = useMemo(
    () =>
      board?.slots.filter((r) => r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze).length ?? 0,
    [board],
  );

  const slotRow = (slot: TimeSlot) => (
    <div key={slot.id} className="slt-row">
      <span className="slt-time mono">{slot.time}</span>
      <span className="tnum slt-cap">{slot.currentOrders}/{slot.maxOrders}</span>
      <div className="slt-types">
        {slot.fulfillmentTypes.map((f) => (
          <span key={f} className="slt-type">{f}</span>
        ))}
      </div>
      {typeof slot.minSpendGrosze === "number" && slot.minSpendGrosze > 0 && (
        <span className="badge warning"><i className="d" />min {zl0(slot.minSpendGrosze)}</span>
      )}
      <span className={`badge ${slot.status === "active" ? "success" : "neutral"}`}><i className="d" />{slot.status}</span>
      <div className="slt-row-actions">
        <button type="button" className="btn ghost" disabled={acting === slot.id} onClick={() => void toggleStatus(slot)}>
          {slot.status === "active" ? "Draft" : "Activate"}
        </button>
        <button type="button" className="btn ghost" disabled={acting === slot.id} onClick={() => void del(slot)}>Delete</button>
      </div>
    </div>
  );

  const byTime = (a: TimeSlot, b: TimeSlot) => a.time.localeCompare(b.time);

  return (
    <div className="svc">
      <div className="slt-bar">
        <div className="seg">
          <button type="button" className={tab === "manage" ? "on" : ""} onClick={() => setTab("manage")}>Manage</button>
          <button type="button" className={tab === "demand" ? "on" : ""} onClick={() => setTab("demand")}>Demand</button>
        </div>
        {tab === "manage" && (
          <div className="seg">
            <button type="button" className={range === "day" ? "on" : ""} onClick={() => setRange("day")}>Day</button>
            <button type="button" className={range === "week" ? "on" : ""} onClick={() => setRange("week")}>Week</button>
          </div>
        )}
        <div className="slt-bar-actions">
          <button type="button" className="btn ghost icon" title="Refresh" onClick={() => void (tab === "demand" ? loadDemand() : loadSlots())}>
            <span className={loading ? "cv2-spin" : ""} style={{ display: "inline-flex" }}><IcoRefresh /></span>
          </button>
          {tab === "manage" ? (
            <button type="button" className="btn primary" onClick={() => setCreating(true)}><IcoPlus /> New slot</button>
          ) : (
            changeCount > 0 && <button type="button" className="btn primary" onClick={() => void applyAll()}>Apply all ({changeCount})</button>
          )}
        </div>
      </div>

      {tab === "manage" ? (
        loading ? (
          <div className="pane-msg">Loading slots…</div>
        ) : range === "week" ? (
          <div className="slt-week">
            {weekDates(date).map((d) => {
              const daySlots = slots.filter((slot) => slot.date === d).sort(byTime);
              return (
                <div key={d} className="slt-day">
                  <div className="slt-day-h">{dayLabel(d)}<span className="n">{daySlots.length}</span></div>
                  {daySlots.length === 0 ? (
                    <div className="pane-msg slt-day-empty">No slots</div>
                  ) : (
                    <div className="slt-list">{daySlots.map(slotRow)}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : slots.filter((slot) => slot.date === date).length === 0 ? (
          <div className="pane-msg">No slots on {date}. Create one to open bookings.</div>
        ) : (
          <div className="slt-list">{slots.filter((slot) => slot.date === date).sort(byTime).map(slotRow)}</div>
        )
      ) : !board || board.slots.length === 0 ? (
        <div className="pane-msg">No slots to forecast on {date}.</div>
      ) : (
        <>
          <div className="slt-demand-sum">
            ~{Math.round(board.summary.predictedCovers)} covers · {board.summary.fillForecastPct}% fill · {board.summary.missedDemand} walked
            {board.kitchenCoversPerHour != null && <> · kitchen {board.kitchenCoversPerHour}/hr</>}
          </div>
          <div className="card card-pad">
            <table className="tbl">
              <thead>
                <tr><th>Slot</th><th>Demand</th><th>Forecast / cap</th><th>Recommendation</th><th /></tr>
              </thead>
              <tbody>
                {board.slots.map((r) => {
                  const changed = r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze;
                  return (
                    <tr key={r.slotId}>
                      <td className="mono">{r.time}</td>
                      <td><span className={`badge ${TIER_TONE[r.tier]}`}><i className="d" />{r.tier}</span></td>
                      <td className="num">~{r.predictedDemand} / {r.maxOrders}{r.throughputCapacity != null ? ` · k${r.throughputCapacity}` : ""}</td>
                      <td>
                        {ACTION_LABEL[r.action]}
                        {(r.action === "raise" || r.action === "trim") && ` → ${r.recommendedMaxOrders}`}
                        {r.recommendedMinSpendGrosze > 0 && <span className="badge warning" style={{ marginLeft: 6 }}><i className="d" />min {zl0(r.recommendedMinSpendGrosze)}</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {changed && (
                          <button type="button" className="btn ghost" disabled={acting === r.slotId} onClick={() => void applyDemand(r.slotId, r.recommendedMaxOrders, r.recommendedMinSpendGrosze)}>
                            Apply
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SlotDialog loc={loc} date={date} open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void loadSlots(); }} />
    </div>
  );
}

function SlotDialog({
  loc,
  date,
  open,
  onClose,
  onSaved,
}: {
  loc: string;
  date: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [bulk, setBulk] = useState(false);
  const [time, setTime] = useState("18:00");
  const [endTime, setEndTime] = useState("21:00");
  const [interval, setInterval] = useState("30");
  const [maxOrders, setMaxOrders] = useState("8");
  const [types, setTypes] = useState<FulfillmentType[]>(["dine-in"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setBusy(false);
      setBulk(false);
    }
  }, [open]);

  const toggleType = (f: FulfillmentType) =>
    setTypes((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const save = async () => {
    if (types.length === 0) return;
    setBusy(true);
    const body = bulk
      ? { fromDate: date, toDate: date, startTime: time, endTime, interval: Number(interval) || 30, maxOrders: Number(maxOrders) || 1, fulfillmentTypes: types, status: "active" }
      : { locationSlug: loc, date, time, maxOrders: Number(maxOrders) || 1, fulfillmentTypes: types, status: "active" };
    const res = await fetch(`/api/admin/slots${bulk ? "?bulk=1" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bulk ? { ...body, locationSlug: loc } : body),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(bulk ? "Slots created" : "Slot created");
      onSaved();
    } else toast.error("Could not create");
  };

  if (!open) return null;

  return createPortal(
    <div className="corev2" data-cv2-portal>
      <div className="overlay" onClick={onClose}>
        <div className="dialog" style={{ width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
          <div className="dialog-h">
            <h2>New slot{bulk ? "s" : ""} · {date}</h2>
            <button type="button" className="x" aria-label="Close" onClick={onClose}>✕</button>
          </div>
          <div className="dialog-b">
            <div className="field">
              <label>{bulk ? "Start time" : "Time"}</label>
              <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            {bulk && (
              <>
                <div className="field">
                  <label>End time</label>
                  <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
                <div className="field">
                  <label>Interval (min)</label>
                  <input className="input" type="number" value={interval} onChange={(e) => setInterval(e.target.value)} />
                </div>
              </>
            )}
            <div className="field">
              <label>Capacity (max orders)</label>
              <input className="input" type="number" min={1} value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Fulfilment</label>
              <div className="slt-fulfil">
                {FULFILMENTS.map((f) => (
                  <button key={f} type="button" className={`fchip${types.includes(f) ? " on" : ""}`} onClick={() => toggleType(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="dialog-f">
            <button type="button" className="btn ghost" onClick={() => setBulk((b) => !b)} disabled={busy} style={{ marginRight: "auto" }}>
              {bulk ? "Single" : "Bulk"}
            </button>
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>Create</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
