"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { recommendSeating, type FloorTwin, type TwinTableRow } from "@/lib/floor-twin";
import type { FloorTable, TableStatus } from "@/data/types";
import { serviceTabs } from "./serviceTabs";

interface Kitchen {
  tier: "calm" | "warn" | "risk";
  label: string | null;
  util: number;
}

const STATUSES: TableStatus[] = ["available", "seated", "reserved", "out-of-service"];
const zl0 = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;
const zl2 = (g: number) => `${(g / 100).toFixed(2)} zł`;

export interface FloorOrderRow {
  id: string;
  status: string;
  paid: boolean;
  channel: "web" | "whatsapp" | "qr" | string;
  fulfillmentType: string;
  customerName: string;
  partySize: number | null;
  tableId: string | null;
  tableNumber: string | null;
  totalAmount: number;
  itemCount: number;
  lines: { name: string; quantity: number }[];
  createdAt: string;
}

const CHANNEL_LABEL: Record<string, string> = { web: "Web", whatsapp: "WhatsApp", qr: "QR", pos: "POS" };

/**
 * Core v2 · Service · Floor — the live room, wired to the same engine as today's
 * /core/service/floor: GET /api/admin/floor-twin → { twin, kitchen }; seat/clear
 * via POST /api/admin/floor-twin; table CRUD via /api/admin/floor/tables. Zoned
 * tiles, a KPI strip incl. spend velocity, the kitchen-bottleneck banner, a
 * predictive-seating recommender and a table editor — all in the core flat
 * language with its own core- UI.
 */
export function CoreFloor() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  const [twin, setTwin] = useState<FloorTwin | null>(null);
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [party, setParty] = useState("2");
  const [editing, setEditing] = useState<TwinTableRow | "new" | null>(null);
  const [orders, setOrders] = useState<FloorOrderRow[]>([]);
  const [lookup, setLookup] = useState("");
  const [settling, setSettling] = useState<string | null>(null);

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
  // Initial load + on location change; the recurring refresh is a
  // visibility-aware poll so a backgrounded floor board stops polling.
  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, 15000);

  // Live orders on the floor — table mapping, channel, paid/unpaid status.
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/floor/orders?location=${encodeURIComponent(loc)}`);
      if (!res.ok) return;
      const d = await res.json();
      setOrders(Array.isArray(d.orders) ? d.orders : []);
    } catch {
      /* non-fatal */
    }
  }, [loc]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);
  usePolling(loadOrders, 10000);

  const ordersByTable = useMemo(() => {
    const m = new Map<string, FloorOrderRow[]>();
    for (const o of orders) {
      if (!o.tableId) continue;
      (m.get(o.tableId) ?? m.set(o.tableId, []).get(o.tableId)!).push(o);
    }
    return m;
  }, [orders]);

  const settle = async (orderId: string) => {
    if (settling) return;
    setSettling(orderId);
    try {
      const res = await fetch(`/api/admin/floor/orders?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "settle" }),
      });
      if (res.ok) { toast("Order settled", "success"); await loadOrders(); }
      else toast("Could not settle order", "danger");
    } finally {
      setSettling(null);
    }
  };

  const lookupResults = useMemo(() => {
    const q = lookup.trim().toLowerCase();
    if (!q) return [];
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.tableNumber ?? "").toLowerCase().includes(q),
    ).slice(0, 8);
  }, [lookup, orders]);

  const unpaidCount = useMemo(() => orders.filter((o) => !o.paid).length, [orders]);

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

  // Optimistic merge so a created/edited/deleted table reflects instantly in
  // the twin instead of vanishing until the (heavy) refetch returns. load()
  // still runs afterwards to reconcile the derived KPIs/physics.
  const applyTableChange = useCallback((change: { table?: FloorTable; deletedId?: string }) => {
    setTwin((prev) => {
      if (!prev) return prev;
      let tables = prev.tables;
      if (change.deletedId) {
        tables = tables.filter((t) => t.id !== change.deletedId);
      } else if (change.table) {
        const ft = change.table;
        const existing = prev.tables.find((t) => t.id === ft.id);
        const row: TwinTableRow = existing
          ? { ...existing, number: ft.number, seats: ft.seats, zone: ft.zone, status: ft.status, notes: ft.notes, occupied: ft.status === "seated" }
          : {
              id: ft.id,
              number: ft.number,
              seats: ft.seats,
              zone: ft.zone,
              status: ft.status,
              notes: ft.notes,
              turns: 0,
              medianDwellMin: null,
              dwellSource: null,
              avgSpendGrosze: null,
              spendVelocityPerHourGrosze: null,
              occupied: ft.status === "seated",
              occupiedSince: null,
              elapsedMin: null,
              predictedFreeInMin: null,
              party: null,
              openCheckGrosze: null,
            };
        tables = existing
          ? prev.tables.map((t) => (t.id === ft.id ? row : t))
          : [...prev.tables, row];
      }
      return { ...prev, tables };
    });
  }, []);

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
    <CoreShell
      eyebrow="Service · Floor & Slots"
      tabs={serviceTabs("floor")}
      subRight={
        <>
          <button type="button" className="core-iconbtn" title="Refresh" onClick={() => void load()}>⟳</button>
          <button type="button" className="core-btn primary sm" onClick={() => setEditing("new")}>+ Add table</button>
        </>
      }
    >
      <div className="core-guest-inbox">
        <div className="core-kpi-strip">
          <div className="k"><div className="kl">Covers seated</div><div className="kv mono">{s ? `${s.seated} / ${s.totalTables}` : "—"}</div></div>
          <div className="k"><div className="kl">Occupancy</div><div className="kv mono">{s ? `${Math.round(s.occupancyPct)}%` : "—"}</div></div>
          <div className="k"><div className="kl">Turn time</div><div className="kv mono">{s?.medianTurnMin != null ? `${s.medianTurnMin}m` : "—"}</div></div>
          <div className="k"><div className="kl">Spend / hr</div><div className="kv mono">{s?.spendVelocityPerHourGrosze != null ? zl0(s.spendVelocityPerHourGrosze) : "—"}</div></div>
          <div className="k"><div className="kl">Freeing ≤15m</div><div className="kv mono">{s?.freeingSoon15 ?? "—"}</div></div>
          <div className="k"><div className="kl">To pay</div><div className="kv mono" style={unpaidCount > 0 ? { color: "var(--brand-bright, #e0564b)" } : undefined}>{unpaidCount || "—"}</div></div>
        </div>

        <div className="core-floor-bar">
          <span className="core-rec-lbl">⌕ Find order</span>
          <input
            className="core-inp"
            style={{ flex: 1, minWidth: 0 }}
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="order id, guest name or table…"
          />
        </div>
        {lookup.trim() && (
          <div className="core-lookup-results">
            {lookupResults.length === 0 ? (
              <div className="core-ctx-empty pad">No active order matches &ldquo;{lookup.trim()}&rdquo;.</div>
            ) : (
              lookupResults.map((o) => (
                <div key={o.id} className="core-lookup-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {o.tableNumber ? `Table ${o.tableNumber}` : o.fulfillmentType} · {o.customerName}
                      <span className="core-chip" style={{ marginLeft: 8, height: 20, fontSize: 10.5 }}>{CHANNEL_LABEL[o.channel] ?? o.channel}</span>
                    </div>
                    <div className="core-cust-sub" style={{ fontSize: 11.5 }}>{o.id} · {o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}</div>
                  </div>
                  <span className={o.paid ? "core-tpay paid" : "core-tpay due"} style={{ position: "static" }}>{o.paid ? "✓ paid" : `${zl2(o.totalAmount)} to pay`}</span>
                  {!o.paid && (
                    <button type="button" className="core-btn primary sm" disabled={settling === o.id} onClick={() => void settle(o.id)}>
                      {settling === o.id ? "…" : "Mark paid"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {kitchen && kitchen.tier !== "calm" && (
          <div className={`core-bottleneck ${kitchen.tier}`}>
            <span className="dot" />
            Kitchen {kitchen.tier === "risk" ? "at risk" : "warming"} — {kitchen.label ?? "a station"} at {Math.round(kitchen.util)}% · pace the seating
          </div>
        )}

        <div className="core-floor-bar">
          <span className="core-rec-lbl">✦ Seat a party of</span>
          <input
            className="core-inp core-rec-n"
            type="number"
            min={1}
            max={50}
            value={party}
            onChange={(e) => setParty(e.target.value)}
          />
          <div className="core-rec-chips">
            {recs.length === 0 ? (
              <span className="core-rec-empty">No table fits a party of {partyN}.</span>
            ) : (
              recs.map((r) => (
                <button
                  key={r.tableId}
                  type="button"
                  className="core-fchip"
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

        <div className="core-floor">
          {!twin ? (
            <div className="core-ctx-empty pad">Loading floor…</div>
          ) : zones.length === 0 ? (
            <div className="core-ctx-empty pad">No tables yet — add one to start modelling the floor.</div>
          ) : (
            zones.map(([zone, tbls]) => (
              <div key={zone}>
                <div className="core-zone-h">
                  <span className="zt">{zone}</span>
                  <span className="core-cust-sub">{tbls.length} tables · {tbls.reduce((a, t) => a + t.seats, 0)} covers</span>
                </div>
                <div className="core-tables">
                  {tbls.map((t) => {
                    const st = stateOf(t);
                    const tOrders = ordersByTable.get(t.id) ?? [];
                    const tUnpaid = tOrders.filter((o) => !o.paid);
                    const tDue = tUnpaid.reduce((a, o) => a + o.totalAmount, 0);
                    const hasQr = tOrders.some((o) => o.channel === "qr");
                    return (
                      <div key={t.id} className="core-tbl2-wrap">
                        <button
                          className={`core-tbl2 ${st.cls}`}
                          onClick={() => act(t)}
                          disabled={acting === t.id || t.status === "out-of-service"}
                          title={t.status === "out-of-service" ? "Out of service" : t.occupied ? "Clear table" : "Seat table"}
                        >
                          <span className="tnum">{t.number}{t.notes ? <span className="core-tnote" title={t.notes}> 📝</span> : null}</span>
                          <span className="tcap">{t.party ? `${t.party} / ${t.seats}` : `${t.seats} seats`}</span>
                          <span className={`tst ${st.cls}`}>● {st.label}</span>
                          {tUnpaid.length > 0 ? (
                            <span className="core-tpay due" title={`${tUnpaid.length} order${tUnpaid.length === 1 ? "" : "s"} to pay`}>
                              {hasQr ? "QR · " : ""}{zl2(tDue)} to pay
                            </span>
                          ) : tOrders.length > 0 ? (
                            <span className="core-tpay paid">{hasQr ? "QR " : ""}✓ paid</span>
                          ) : t.openCheckGrosze ? (
                            <span className="tinfo mono">{zl0(t.openCheckGrosze)} open</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="core-tbl2-edit"
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
        tableOrders={editing && editing !== "new" ? ordersByTable.get(editing.id) ?? [] : []}
        settling={settling}
        onSettle={settle}
        onClose={() => setEditing(null)}
        onSaved={(change) => {
          setEditing(null);
          applyTableChange(change);
          void load();
        }}
      />
    </CoreShell>
  );
}

function TableDialog({
  loc,
  table,
  tableOrders,
  settling,
  onSettle,
  onClose,
  onSaved,
}: {
  loc: string;
  table: TwinTableRow | "new" | null;
  tableOrders: FloorOrderRow[];
  settling: string | null;
  onSettle: (orderId: string) => void;
  onClose: () => void;
  onSaved: (change: { table?: FloorTable; deletedId?: string }) => void;
}) {
  const toast = useCoreToast();
  const isNew = table === "new";
  const row = table && table !== "new" ? table : null;
  const [number, setNumber] = useState("");
  const [seats, setSeats] = useState("4");
  const [zone, setZone] = useState("");
  const [status, setStatus] = useState<TableStatus>("available");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const rowNotes = row?.notes ?? "";

  useEffect(() => {
    if (table) {
      setNumber(row?.number ?? "");
      setSeats(String(row?.seats ?? 4));
      setZone(row?.zone ?? "");
      setStatus(row?.status ?? "available");
      setNotes(rowNotes);
      setBusy(false);
    }
  }, [table, row, rowNotes]);

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
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        const saved = (await res.json().catch(() => null)) as FloorTable | null;
        toast(isNew ? "Table added" : "Table saved", "success");
        onSaved(saved ? { table: saved } : {});
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
        onSaved({ deletedId: row.id });
      } else toast("Could not delete", "danger");
    } catch {
      toast("Network error — try again", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoreDialog
      open={table != null}
      onClose={onClose}
      title={isNew ? "Add table" : `Table ${row?.number}`}
      footer={
        <>
          {row && (
            <button type="button" className="core-btn danger" onClick={() => void del()} disabled={busy} style={{ marginRight: "auto" }}>
              Delete
            </button>
          )}
          <button type="button" className="core-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="core-btn primary" onClick={() => void save()} disabled={busy || !number.trim()}>
            {isNew ? "Add" : "Save"}
          </button>
        </>
      }
    >
      <label className="core-tbl-field">
        <span>Number / label</span>
        <input className="core-inp" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12, Bar 3, Patio A" autoFocus />
      </label>
      <label className="core-tbl-field">
        <span>Seats</span>
        <input className="core-inp" type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
      </label>
      <label className="core-tbl-field">
        <span>Zone</span>
        <input className="core-inp" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="main, patio, bar" />
      </label>
      <label className="core-tbl-field">
        <span>Status</span>
        <select className="core-inp" value={status} onChange={(e) => setStatus(e.target.value as TableStatus)}>
          {STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </label>
      <label className="core-tbl-field">
        <span>Service note</span>
        <textarea className="core-inp" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="allergy, VIP, high-chair, split bill…" style={{ resize: "vertical", fontFamily: "inherit" }} />
      </label>

      {!isNew && tableOrders.length > 0 && (
        <div className="core-tbl-orders">
          <div className="core-zone-h" style={{ marginTop: 6 }}><span className="zt">Orders at this table</span></div>
          {tableOrders.map((o) => (
            <div key={o.id} className="core-lookup-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {o.customerName}
                  <span className="core-chip" style={{ marginLeft: 8, height: 20, fontSize: 10.5 }}>{CHANNEL_LABEL[o.channel] ?? o.channel}</span>
                </div>
                <div className="core-cust-sub" style={{ fontSize: 11.5 }}>{o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}</div>
              </div>
              <span className={o.paid ? "core-tpay paid" : "core-tpay due"} style={{ position: "static" }}>{o.paid ? "✓ paid" : `${zl2(o.totalAmount)}`}</span>
              {!o.paid && (
                <button type="button" className="core-btn primary sm" disabled={settling === o.id} onClick={() => onSettle(o.id)}>
                  {settling === o.id ? "…" : "Mark paid"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </CoreDialog>
  );
}
