"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { recommendSeating, type FloorTwin, type TwinTableRow } from "@/lib/floor-twin";
import type { TableStatus } from "@/data/types";
import { serviceTabs } from "./serviceTabs";

interface Kitchen {
  tier: "calm" | "warn" | "risk";
  label: string | null;
  util: number;
}

const STATUSES: TableStatus[] = ["available", "seated", "reserved", "out-of-service"];
const zl0 = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;

/**
 * Core v2 · Service · Floor — the live room, wired to the same engine as today's
 * /core/service/floor: GET /api/admin/floor-twin → { twin, kitchen }; seat/clear
 * via POST /api/admin/floor-twin; table CRUD via /api/admin/floor/tables. Zoned
 * tiles, a KPI strip incl. spend velocity, the kitchen-bottleneck banner, a
 * predictive-seating recommender and a table editor — all in the core-v2 flat
 * language with its own cv- UI.
 */
export function CoreV2Floor() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  const [twin, setTwin] = useState<FloorTwin | null>(null);
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [party, setParty] = useState("2");
  const [editing, setEditing] = useState<TwinTableRow | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(loc)}`);
      if (!res.ok) return;
      const d = await res.json();
      setTwin((d.twin as FloorTwin) ?? (d as FloorTwin));
      setKitchen((d.kitchen as Kitchen) ?? null);
    } catch {
      /* non-fatal */
    }
  }, [loc]);
  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const post = async (action: "seat" | "clear", tableId: string, number: string) => {
    if (acting) return;
    setActing(tableId);
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tableId }),
      });
      if (res.ok) {
        toast(`Table ${number} ${action === "seat" ? "seated" : "cleared"}`, "success");
        await load();
      } else toast("Could not update table", "danger");
    } finally {
      setActing(null);
    }
  };
  const act = (t: TwinTableRow) => {
    if (t.status === "out-of-service") return;
    void post(t.occupied ? "clear" : "seat", t.id, t.number);
  };

  const partyN = Math.max(1, Math.min(50, Math.round(Number(party) || 0)));
  const recs = useMemo(() => (twin ? recommendSeating(twin, partyN) : []), [twin, partyN]);

  const zones = useMemo(() => {
    const m = new Map<string, TwinTableRow[]>();
    for (const t of twin?.tables ?? []) {
      const z = t.zone || "Floor";
      (m.get(z) ?? m.set(z, []).get(z)!).push(t);
    }
    return [...m.entries()];
  }, [twin]);

  const s = twin?.summary;
  const stateOf = (t: TwinTableRow): { cls: string; label: string } => {
    if (t.status === "out-of-service") return { cls: "oos", label: "Out of service" };
    if (t.occupied && t.predictedFreeInMin != null && t.predictedFreeInMin <= 15)
      return { cls: "freeing", label: `Freeing ~${Math.max(0, t.predictedFreeInMin)}m` };
    if (t.occupied) return { cls: "seated", label: t.elapsedMin != null ? `Seated ${t.elapsedMin}m` : "Seated" };
    if (t.status === "reserved") return { cls: "booked", label: "Reserved" };
    return { cls: "free", label: "Free" };
  };

  return (
    <CoreV2Shell
      eyebrow="Service · Floor & Slots"
      tabs={serviceTabs("floor")}
      subRight={
        <>
          <button type="button" className="cv-iconbtn" title="Refresh" onClick={() => void load()}>⟳</button>
          <button type="button" className="cv-btn primary sm" onClick={() => setEditing("new")}>+ Add table</button>
        </>
      }
    >
      <div className="cv-guest-inbox">
        <div className="cv-kpi-strip">
          <div className="k"><div className="kl">Covers seated</div><div className="kv mono">{s ? `${s.seated} / ${s.totalTables}` : "—"}</div></div>
          <div className="k"><div className="kl">Occupancy</div><div className="kv mono">{s ? `${Math.round(s.occupancyPct)}%` : "—"}</div></div>
          <div className="k"><div className="kl">Turn time</div><div className="kv mono">{s?.medianTurnMin != null ? `${s.medianTurnMin}m` : "—"}</div></div>
          <div className="k"><div className="kl">Spend / hr</div><div className="kv mono">{s?.spendVelocityPerHourGrosze != null ? zl0(s.spendVelocityPerHourGrosze) : "—"}</div></div>
          <div className="k"><div className="kl">Freeing ≤15m</div><div className="kv mono">{s?.freeingSoon15 ?? "—"}</div></div>
        </div>

        {kitchen && kitchen.tier !== "calm" && (
          <div className={`cv-bottleneck ${kitchen.tier}`}>
            <span className="dot" />
            Kitchen {kitchen.tier === "risk" ? "at risk" : "warming"} — {kitchen.label ?? "a station"} at {Math.round(kitchen.util)}% · pace the seating
          </div>
        )}

        <div className="cv-floor-bar">
          <span className="cv-rec-lbl">✦ Seat a party of</span>
          <input
            className="cv-inp cv-rec-n"
            type="number"
            min={1}
            max={50}
            value={party}
            onChange={(e) => setParty(e.target.value)}
          />
          <div className="cv-rec-chips">
            {recs.length === 0 ? (
              <span className="cv-rec-empty">No table fits a party of {partyN}.</span>
            ) : (
              recs.map((r) => (
                <button
                  key={r.tableId}
                  type="button"
                  className="cv-fchip"
                  disabled={r.readyInMin !== 0 || acting === r.tableId}
                  onClick={() => void post("seat", r.tableId, r.number)}
                  title={r.note}
                >
                  {r.number}
                  <span className="n">{r.readyInMin === 0 ? "seat" : `~${r.readyInMin}m`}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="cv-floor">
          {!twin ? (
            <div className="cv-ctx-empty pad">Loading floor…</div>
          ) : zones.length === 0 ? (
            <div className="cv-ctx-empty pad">No tables yet — add one to start modelling the floor.</div>
          ) : (
            zones.map(([zone, tbls]) => (
              <div key={zone}>
                <div className="cv-zone-h">
                  <span className="zt">{zone}</span>
                  <span className="cv-cust-sub">{tbls.length} tables · {tbls.reduce((a, t) => a + t.seats, 0)} covers</span>
                </div>
                <div className="cv-tables">
                  {tbls.map((t) => {
                    const st = stateOf(t);
                    return (
                      <div key={t.id} className="cv-tbl2-wrap">
                        <button
                          className={`cv-tbl2 ${st.cls}`}
                          onClick={() => act(t)}
                          disabled={acting === t.id || t.status === "out-of-service"}
                          title={t.status === "out-of-service" ? "Out of service" : t.occupied ? "Clear table" : "Seat table"}
                        >
                          <span className="tnum">{t.number}</span>
                          <span className="tcap">{t.party ? `${t.party} / ${t.seats}` : `${t.seats} seats`}</span>
                          <span className={`tst ${st.cls}`}>● {st.label}</span>
                          {t.openCheckGrosze ? <span className="tinfo mono">{zl0(t.openCheckGrosze)} open</span> : null}
                        </button>
                        <button
                          type="button"
                          className="cv-tbl2-edit"
                          onClick={() => setEditing(t)}
                          title="Edit table"
                          aria-label={`Edit table ${t.number}`}
                        >
                          ⋯
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <TableDialog
        loc={loc}
        table={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </CoreV2Shell>
  );
}

function TableDialog({
  loc,
  table,
  onClose,
  onSaved,
}: {
  loc: string;
  table: TwinTableRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useCoreToast();
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

  const save = async () => {
    if (!number.trim() || busy) return;
    setBusy(true);
    try {
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
      if (res.ok) {
        toast(isNew ? "Table added" : "Table saved", "success");
        onSaved();
      } else toast("Could not save table", "danger");
    } catch {
      toast("Network error — try again", "danger");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!row || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/floor/tables?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast("Table deleted", "success");
        onSaved();
      } else toast("Could not delete", "danger");
    } catch {
      toast("Network error — try again", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoreV2Dialog
      open={table != null}
      onClose={onClose}
      title={isNew ? "Add table" : `Table ${row?.number}`}
      footer={
        <>
          {row && (
            <button type="button" className="cv-btn danger" onClick={() => void del()} disabled={busy} style={{ marginRight: "auto" }}>
              Delete
            </button>
          )}
          <button type="button" className="cv-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="cv-btn primary" onClick={() => void save()} disabled={busy || !number.trim()}>
            {isNew ? "Add" : "Save"}
          </button>
        </>
      }
    >
      <label className="cv-tbl-field">
        <span>Number / label</span>
        <input className="cv-inp" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12, Bar 3, Patio A" autoFocus />
      </label>
      <label className="cv-tbl-field">
        <span>Seats</span>
        <input className="cv-inp" type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
      </label>
      <label className="cv-tbl-field">
        <span>Zone</span>
        <input className="cv-inp" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="main, patio, bar" />
      </label>
      <label className="cv-tbl-field">
        <span>Status</span>
        <select className="cv-inp" value={status} onChange={(e) => setStatus(e.target.value as TableStatus)}>
          {STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </label>
    </CoreV2Dialog>
  );
}
