"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { FulfillmentType, TimeSlot } from "@/data/types";
import type { DemandAction, DemandBoard, DemandTier } from "@/lib/demand-exchange";
import { Button, Dialog } from "@/ui";
import { useToast } from "@/ui/Toast";

/**
 * Slots view — time-slot capacity management + the Demand Exchange yield board,
 * on the Core suite theme (folded into Service). See
 * docs/design-system/core/modules/service.md.
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

  const toggleStatus = async (s: TimeSlot) => {
    setActing(s.id);
    const next = s.status === "active" ? "draft" : "active";
    const r = await fetch("/api/admin/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, status: next }),
    });
    setActing(null);
    if (r.ok) {
      toast.success(next === "active" ? "Slot activated" : "Slot drafted");
      await loadSlots();
    } else toast.error("Could not update slot");
  };

  const del = async (s: TimeSlot) => {
    setActing(s.id);
    const r = await fetch(`/api/admin/slots?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
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

  const slotRow = (s: TimeSlot) => {
    const fill = s.maxOrders > 0 ? Math.min(100, (s.currentOrders / s.maxOrders) * 100) : 0;
    return (
    <div key={s.id} className="slt-row">
      <span className="slt-time mono">{s.time}</span>
      <div className="slt-cap-col">
        <span className="tnum slt-cap">{s.currentOrders}/{s.maxOrders}</span>
        <div className="captrack">
          <div className={`capfill${fill >= 85 ? " hot" : ""}`} style={{ width: `${fill}%` }} />
        </div>
      </div>
      <div className="slt-types">
        {s.fulfillmentTypes.map((f) => (
          <span key={f} className="slt-type">{f}</span>
        ))}
      </div>
      {typeof s.minSpendGrosze === "number" && s.minSpendGrosze > 0 && (
        <span className="badge warning"><i className="d" />min {zl0(s.minSpendGrosze)}</span>
      )}
      <span className={`badge ${s.status === "active" ? "success" : "neutral"}`}><i className="d" />{s.status}</span>
      <div className="slt-row-actions">
        <button type="button" className="btn ghost" disabled={acting === s.id} onClick={() => void toggleStatus(s)}>
          {s.status === "active" ? "Draft" : "Activate"}
        </button>
        <button type="button" className="btn ghost" disabled={acting === s.id} onClick={() => void del(s)}>Delete</button>
      </div>
    </div>
    );
  };

  const byTime = (a: TimeSlot, b: TimeSlot) => a.time.localeCompare(b.time);

  return (
    <div className="svc slt">
      <div className="intro">
        <h1>Service · Slots — capacity &amp; demand</h1>
        <p>
          Define dine-in windows and their cover caps; watch fill-rate and a demand-based price
          multiplier (surge when a slot runs hot). Manage / Demand and Day / Week views. Bookings made
          here flow straight into the Guest · Book console.
        </p>
      </div>
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
            <RefreshCw className={loading ? "crm-spin" : ""} />
          </button>
          {tab === "manage" ? (
            <button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus width={15} height={15} /> New slot</button>
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
              const daySlots = slots.filter((s) => s.date === d).sort(byTime);
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
        ) : slots.filter((s) => s.date === date).length === 0 ? (
          <div className="pane-msg">No slots on {date}. Create one to open bookings.</div>
        ) : (
          <div className="slt-list">{slots.filter((s) => s.date === date).sort(byTime).map(slotRow)}</div>
        )
      ) : !board || board.slots.length === 0 ? (
        <div className="pane-msg">No slots to forecast on {date}.</div>
      ) : (
        <>
          <div className="slt-demand-sum">
            ~{Math.round(board.summary.predictedCovers)} covers · {board.summary.fillForecastPct}% fill · {board.summary.missedDemand} walked
            {board.kitchenCoversPerHour != null && <> · kitchen {board.kitchenCoversPerHour}/hr</>}
          </div>
          <div className="loy-card">
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

  if (!open) return <Dialog open={false} onClose={onClose} theme="core" />;
  return (
    <Dialog
      open
      onClose={onClose}
      theme="core"
      size="sm"
      title={`New slot${bulk ? "s" : ""} · ${date}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setBulk((b) => !b)} disabled={busy} style={{ marginRight: "auto" }}>
            {bulk ? "Single" : "Bulk"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>Create</Button>
        </>
      }
    >
      <div className="loy-dialog-form">
        <label className="loy-field">
          <span className="loy-field-label">{bulk ? "Start time" : "Time"}</span>
          <input className="v2-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        {bulk && (
          <>
            <label className="loy-field">
              <span className="loy-field-label">End time</span>
              <input className="v2-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
            <label className="loy-field">
              <span className="loy-field-label">Interval (min)</span>
              <input className="v2-input" type="number" value={interval} onChange={(e) => setInterval(e.target.value)} />
            </label>
          </>
        )}
        <label className="loy-field">
          <span className="loy-field-label">Capacity (max orders)</span>
          <input className="v2-input" type="number" min={1} value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} />
        </label>
        <div className="loy-field">
          <span className="loy-field-label">Fulfilment</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FULFILMENTS.map((f) => (
              <button key={f} type="button" className={`fchip${types.includes(f) ? " on" : ""}`} onClick={() => toggleType(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
