"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Plus, RefreshCw, Sparkles } from "lucide-react";
import type { TableStatus } from "@/data/types";
import { recommendSeating, type FloorTwin } from "@/lib/floor-twin";
import { Button, Dialog } from "../v2/ui";
import { useToast } from "../v2/ui/Toast";

/**
 * Floor view — the live room as a Core-suite surface (Module 3's Twin, folded
 * into Service). Realized turn-time + spend velocity + predicted free-in per
 * table, a predictive-seating recommender, Seat / Clear acts, a bottleneck
 * banner, and table CRUD. See docs/design-system/core/modules/service.md.
 */

interface Kitchen {
  tier: "calm" | "warn" | "risk";
  station: string | null;
  label: string | null;
  util: number;
}
type TwinRow = FloorTwin["tables"][number];
const zl = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;

const STATUSES: TableStatus[] = ["available", "seated", "reserved", "out-of-service"];

export function FloorView({ loc }: { loc: string }) {
  const toast = useToast();
  const [twin, setTwin] = useState<FloorTwin | null>(null);
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [party, setParty] = useState("2");
  const [editing, setEditing] = useState<TwinRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(loc)}`);
      const j = res.ok ? await res.json() : null;
      setTwin((j?.twin as FloorTwin) ?? null);
      setKitchen((j?.kitchen as Kitchen) ?? null);
    } finally {
      setLoading(false);
    }
  }, [loc]);

  useEffect(() => {
    void load();
  }, [load]);

  const seatClear = async (tableId: string, action: "seat" | "clear") => {
    setActing(tableId);
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tableId }),
      });
      if (res.ok) {
        toast.success(action === "seat" ? "Seated" : "Cleared");
        await load();
      } else toast.error("Could not update table");
    } finally {
      setActing(null);
    }
  };

  const partyN = Math.max(1, Math.min(50, Math.round(Number(party) || 0)));
  const recs = useMemo(() => (twin ? recommendSeating(twin, partyN) : []), [twin, partyN]);

  if (loading && !twin) return <div className="svc"><div className="pane-msg">Modelling the floor…</div></div>;
  const s = twin?.summary;

  return (
    <div className="svc flr">
      {kitchen && kitchen.tier !== "calm" && (
        <div className={`flr-kitchen ${kitchen.tier}`}>
          <Gauge width={15} height={15} />
          <b>Kitchen {kitchen.tier === "risk" ? "overloaded" : "filling up"}</b>
          <span className="badge warning"><i className="d" />{kitchen.label} · {kitchen.util}%</span>
          <span className="flr-kitchen-note">Pace new seating — the line can&apos;t absorb more covers.</span>
        </div>
      )}

      {s && (
        <div className="flr-kpis">
          <div className="bk"><div className="l">Occupancy</div><div className="v tnum">{s.occupancyPct}%</div><div className="sub">{s.seated}/{s.totalTables} seated</div></div>
          <div className="bk"><div className="l">Open now</div><div className="v tnum">{s.openTables}</div><div className="sub">{s.freeingSoon15} freeing ≤15m</div></div>
          <div className="bk"><div className="l">Median turn</div><div className="v tnum">{s.medianTurnMin != null ? `${s.medianTurnMin}m` : "—"}</div><div className="sub">realized</div></div>
          <div className="bk"><div className="l">Spend / hr</div><div className="v tnum">{s.spendVelocityPerHourGrosze != null ? zl(s.spendVelocityPerHourGrosze) : "—"}</div><div className="sub">per table-hour</div></div>
        </div>
      )}

      <div className="flr-bar">
        <div className="flr-rec">
          <Sparkles width={14} height={14} />
          <span>Seat a party of</span>
          <input type="number" className="input" min={1} max={50} value={party} onChange={(e) => setParty(e.target.value)} style={{ width: 64 }} />
          <div className="flr-recs">
            {recs.length === 0 ? (
              <span className="pane-msg" style={{ padding: 0 }}>No table fits.</span>
            ) : (
              recs.map((r) => (
                <button
                  key={r.tableId}
                  type="button"
                  className="fchip"
                  disabled={r.readyInMin !== 0 || acting === r.tableId}
                  onClick={() => void seatClear(r.tableId, "seat")}
                  title={r.note}
                >
                  {r.number}
                  <span className="n">{r.readyInMin === 0 ? "seat" : `~${r.readyInMin}m`}</span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flr-bar-actions">
          <button type="button" className="btn ghost icon" title="Refresh" onClick={() => void load()}>
            <RefreshCw className={loading ? "crm-spin" : ""} />
          </button>
          <button type="button" className="btn primary" onClick={() => setEditing("new")}>
            <Plus width={15} height={15} /> Add table
          </button>
        </div>
      </div>

      {!twin || twin.tables.length === 0 ? (
        <div className="pane-msg">No tables yet — add one to start modelling the floor.</div>
      ) : (
        <div className="flr-grid">
          {twin.tables.map((t) => (
            <div key={t.id} className={`flr-card${t.occupied ? " seated" : ""}${t.status === "out-of-service" ? " oos" : ""}`}>
              <div className="flr-card-head">
                <button type="button" className="flr-num" onClick={() => setEditing(t)} title="Edit table">
                  {t.number}
                </button>
                <span className={`badge ${t.status === "out-of-service" ? "neutral" : t.occupied ? "warning" : "success"}`}>
                  <i className="d" />
                  {t.status === "out-of-service" ? "out" : t.occupied ? `seated${t.party ? ` ${t.party}p` : ""}` : "open"}
                </span>
              </div>
              <div className="flr-live">
                <span>{t.seats} seats{t.zone ? ` · ${t.zone}` : ""}</span>
                {t.predictedFreeInMin != null && (
                  <span>{t.predictedFreeInMin <= 0 ? "finishing" : `frees ~${t.predictedFreeInMin}m`}</span>
                )}
                {t.medianDwellMin != null && <span className="muted">{t.medianDwellMin}m turn{t.dwellSource === "measured" ? " ✓" : ""}</span>}
                {t.spendVelocityPerHourGrosze != null && <span className="muted">{zl(t.spendVelocityPerHourGrosze)}/h</span>}
              </div>
              {t.status !== "out-of-service" && (
                <div className="flr-actions">
                  {t.occupied ? (
                    <button type="button" className="btn ghost" disabled={acting === t.id} onClick={() => void seatClear(t.id, "clear")}>
                      Clear
                    </button>
                  ) : (
                    <button type="button" className="btn primary" disabled={acting === t.id} onClick={() => void seatClear(t.id, "seat")}>
                      Seat
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <TableDialog
        loc={loc}
        table={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </div>
  );
}

function TableDialog({
  loc,
  table,
  onClose,
  onSaved,
}: {
  loc: string;
  table: TwinRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = table === "new";
  const row = table && table !== "new" ? table : null;
  const [number, setNumber] = useState("");
  const [seats, setSeats] = useState("4");
  const [zone, setZone] = useState("");
  const [status, setStatus] = useState<TableStatus>("available");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (table) {
      setNumber(row?.number ?? "");
      setSeats(String(row?.seats ?? 4));
      setZone(row?.zone ?? "");
      setStatus(row?.status ?? "available");
      setBusy(false);
    }
  }, [table, row]);

  if (!table) return <Dialog open={false} onClose={onClose} theme="core" />;

  const save = async () => {
    if (!number.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row?.id,
        number: number.trim(),
        seats: Math.max(1, Math.min(50, Math.round(Number(seats) || 1))),
        zone: zone.trim() || undefined,
        status,
      }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(isNew ? "Table added" : "Table saved");
      onSaved();
    } else toast.error("Could not save table");
  };

  const del = async () => {
    if (!row) return;
    setBusy(true);
    const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(row.id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Table deleted");
      onSaved();
    } else toast.error("Could not delete");
  };

  return (
    <Dialog
      open
      onClose={onClose}
      theme="core"
      size="sm"
      title={isNew ? "Add table" : `Table ${row?.number}`}
      footer={
        <>
          {row && (
            <Button variant="danger" onClick={del} disabled={busy} style={{ marginRight: "auto" }}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>{isNew ? "Add" : "Save"}</Button>
        </>
      }
    >
      <div className="loy-dialog-form">
        <label className="loy-field">
          <span className="loy-field-label">Number / label</span>
          <input className="v2-input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12, Bar 3, Patio A" />
        </label>
        <label className="loy-field">
          <span className="loy-field-label">Seats</span>
          <input className="v2-input" type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
        </label>
        <label className="loy-field">
          <span className="loy-field-label">Zone</span>
          <input className="v2-input" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="main, patio, bar" />
        </label>
        <label className="loy-field">
          <span className="loy-field-label">Status</span>
          <select className="v2-input" value={status} onChange={(e) => setStatus(e.target.value as TableStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
    </Dialog>
  );
}
