"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { TableStatus } from "@/data/types";
import { recommendSeating, type FloorTwin } from "@/lib/floor-twin";
import { useToast } from "@/ui/Toast";

/**
 * Floor view — Core v2 (`.corev2`) re-skin of `src/core/service/FloorView.tsx`.
 * Same behaviour, same endpoints, re-rendered in the core-suite visual
 * language (`.svc` body, `.flr-*` layout from styles/service.css, generic
 * `.btn`/`.badge`/`.fchip`/`.input` primitives from core.css). The live room as
 * a Twin: realized turn-time + spend velocity + predicted free-in per table, a
 * predictive-seating recommender, Seat / Clear acts, a kitchen bottleneck
 * banner, and table CRUD via a portaled `.overlay`/`.dialog`.
 *
 * Endpoints (verbatim from v1):
 *   GET/POST /api/admin/floor-twin     · room model + kitchen tier · seat/clear
 *   POST/DELETE /api/admin/floor/tables · table CRUD
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

function IcoGauge() {
  return (
    <svg className="icn" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 13a4 4 0 0 1 4-4" /><path d="M12 13l3-3" />
      <path d="M4 18a8 8 0 1 1 16 0" />
    </svg>
  );
}
function IcoSparkles() {
  return (
    <svg className="icn" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18 16l.7 1.8L20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7z" />
    </svg>
  );
}
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
    <div className="svc">
      {kitchen && kitchen.tier !== "calm" && (
        <div className={`flr-kitchen ${kitchen.tier}`}>
          <IcoGauge />
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
          <IcoSparkles />
          <span>Seat a party of</span>
          <input type="number" className="input" min={1} max={50} value={party} onChange={(e) => setParty(e.target.value)} style={{ width: 64 }} />
          <div className="flr-recs">
            {recs.length === 0 ? (
              <span className="subtle">No table fits.</span>
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
            <span className={loading ? "cv2-spin" : ""} style={{ display: "inline-flex" }}><IcoRefresh /></span>
          </button>
          <button type="button" className="btn primary" onClick={() => setEditing("new")}>
            <IcoPlus /> Add table
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

  if (!table) return null;

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

  return createPortal(
    <div className="corev2" data-cv2-portal>
      <div className="overlay" onClick={onClose}>
        <div className="dialog" style={{ width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
          <div className="dialog-h">
            <h2>{isNew ? "Add table" : `Table ${row?.number}`}</h2>
            <button type="button" className="x" aria-label="Close" onClick={onClose}>✕</button>
          </div>
          <div className="dialog-b">
            <div className="field">
              <label>Number / label</label>
              <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12, Bar 3, Patio A" />
            </div>
            <div className="field">
              <label>Seats</label>
              <input className="input" type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
            </div>
            <div className="field">
              <label>Zone</label>
              <input className="input" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="main, patio, bar" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TableStatus)}>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="dialog-f">
            {row && (
              <button type="button" className="btn ghost" onClick={() => void del()} disabled={busy} style={{ marginRight: "auto", color: "var(--danger)" }}>
                Delete
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{isNew ? "Add" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
