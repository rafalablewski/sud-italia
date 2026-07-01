"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePolling } from "@/lib/usePolling";
import { CoreShell } from "@/core/shell/CoreShell";
import { RefreshIcon, PlusIcon } from "@/core/shell/toolIcons";
import { useSelection, type CoreSelection } from "@/core/shell/SelectionContext";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import { CorePos } from "@/core/pos/CorePos";
import { recommendSeating, type FloorTwin, type TwinTableRow } from "@/lib/floor-twin";
import type { FloorTable, MenuItem, TableStatus } from "@/data/types";
import type { UpsellConfig } from "@/lib/upsell";
import { serviceTabs } from "./serviceTabs";

interface Kitchen {
  tier: "calm" | "warn" | "risk";
  label: string | null;
  util: number;
}

const STATUSES: TableStatus[] = ["available", "seated", "reserved", "out-of-service"];
/** A service note that names an allergy / dietary risk gets the amber safety
 *  treatment on the tile — a glance has to catch it, not a hover. */
const ALLERGY_RE = /allerg|gluten|nut|coeliac|celiac|dairy|lactose|shellfish|epi|anaphyl/i;
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
 * Core · Service · Floor — the live room, wired to the same engine as today's
 * /core/service/floor: GET /api/admin/floor-twin → { twin, kitchen }; seat/clear
 * via POST /api/admin/floor-twin; table CRUD via /api/admin/floor/tables. Zoned
 * tiles, a KPI strip incl. spend velocity, the kitchen-bottleneck banner, a
 * predictive-seating recommender and a table editor — all in the core flat
 * language with its own core- UI.
 */
export function CoreFloor({
  menusByLocation,
  upsellByLocation,
}: {
  menusByLocation: Record<string, MenuItem[]>;
  upsellByLocation: Record<string, UpsellConfig | null>;
}) {
  const toast = useCoreToast();
  const { select, selected } = useSelection();
  const { location, activeLocations } = useLocation();
  // The table whose check is open over the floor (the docked check panel).
  const [checkTable, setCheckTable] = useState<TwinTableRow | null>(null);
  // Portal target = the `.core` theme root (NOT document.body) so the panel and
  // the embedded till inherit the core tokens/fonts — the same pattern CoreDialog
  // uses. Portaling to body would drop every `.core`-scoped style.
  const [coreRoot, setCoreRoot] = useState<Element | null>(null);
  useEffect(() => { setCoreRoot(document.querySelector(".core")); }, []);
  // Esc closes the check panel; lock body scroll while it's open so the floor
  // behind doesn't move under the panel.
  useEffect(() => {
    if (!checkTable) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setCheckTable(null); void load(); } };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkTable]);
  const loc = location || activeLocations[0]?.slug || "krakow";
  const [twin, setTwin] = useState<FloorTwin | null>(null);
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [party, setParty] = useState("2");
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
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

  // Live "food up" — the same order stream the KDS bumps into. When a table's
  // ticket hits `ready`, its tile pulses so the server sees food's up without
  // walking the pass (the cross-surface half of the redesign's event spine).
  const { orders: liveOrders } = useAdminOrdersStream(location);
  const foodUpTables = useMemo(() => {
    const s = new Set<string>();
    for (const o of liveOrders) if (o.tableId && o.status === "ready") s.add(o.tableId);
    return s;
  }, [liveOrders]);

  // Guest-ordered tables — a QR order the guest placed at a table, still active
  // (the "fourth renderer" contributing to the floor). The tile flags it and,
  // when a NEW one lands, the server gets a soft toast to review & fire.
  const guestOrderedTables = useMemo(() => {
    const s = new Set<string>();
    for (const o of liveOrders) if (o.channel === "qr" && o.tableId && o.status !== "completed" && o.status !== "cancelled") s.add(o.tableId);
    return s;
  }, [liveOrders]);
  const prevGuest = useRef<Set<string> | null>(null);
  useEffect(() => {
    const prev = prevGuest.current;
    if (prev) {
      for (const id of guestOrderedTables) {
        if (!prev.has(id)) {
          const num = twin?.tables.find((t) => t.id === id)?.number ?? "?";
          toast(`T${num} — guest ordered · review & fire`, "default");
        }
      }
    }
    prevGuest.current = new Set(guestOrderedTables);
  }, [guestOrderedTables, twin, toast]);

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

  // The dock/selection payload for a table — shared by the tile tap and the
  // radial's "Open check" verb so both feed the Context Dock identically.
  const buildSelection = (t: TwinTableRow): CoreSelection => {
    const st = stateOf(t);
    const tOrders = ordersByTable.get(t.id) ?? [];
    const tUnpaid = tOrders.filter((o) => !o.paid);
    const tDue = tUnpaid.reduce((a, o) => a + o.totalAmount, 0);
    return {
      kind: "table", id: t.id, label: `Table ${t.number}`,
      sub: `${t.party ? `${t.party} / ${t.seats}` : `${t.seats}`} covers · ${t.zone || "Floor"}`,
      status: st.label, statusCls: st.cls,
      amount: tUnpaid.length > 0 ? `${zl2(tDue)} to pay` : tOrders.length > 0 ? "✓ paid" : t.openCheckGrosze ? `${zl0(t.openCheckGrosze)} open` : undefined,
      amountDue: tUnpaid.length > 0,
      note: t.notes || undefined,
      allergy: t.notes ? ALLERGY_RE.test(t.notes) : false,
      href: "/core/service/floor",
    };
  };
  const openCheck = (t: TwinTableRow) => {
    if (t.status === "out-of-service") return;
    setCheckTable(t);
    select(buildSelection(t));
  };
  // Contextual radial — a table tap blooms 3-4 verbs relevant to its state.
  const [radial, setRadial] = useState<{ table: TwinTableRow; x: number; y: number } | null>(null);
  // Move mode — after "Move", the next tapped table is the destination.
  const [moveFrom, setMoveFrom] = useState<TwinTableRow | null>(null);
  const startMove = (t: TwinTableRow) => { setMoveFrom(t); toast(`Move Table ${t.number} — tap the destination table`, "default"); };
  const doMove = async (from: TwinTableRow, to: TwinTableRow) => {
    setMoveFrom(null);
    if (from.id === to.id) return;
    setActing(to.id);
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(loc)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", tableId: from.id, toTableId: to.id }),
      });
      if (res.ok) { toast(`Moved Table ${from.number} → Table ${to.number}`, "success"); await load(); }
      else { const j = await res.json().catch(() => ({})); toast(j.error || "Could not move", "danger"); }
    } finally { setActing(null); }
  };
  const radialVerbs = (t: TwinTableRow): { label: string; icon: string; primary?: boolean; on: () => void }[] => {
    if (t.status === "out-of-service")
      return [{ label: "Restore", icon: "↻", primary: true, on: () => setEditing(t) }, { label: "Edit", icon: "⋯", on: () => setEditing(t) }];
    if (t.occupied)
      return [
        { label: "Open check", icon: "🧾", primary: true, on: () => openCheck(t) },
        { label: "Move", icon: "⇄", on: () => startMove(t) },
        { label: "Free", icon: "✓", on: () => act(t) },
        { label: "Edit", icon: "⋯", on: () => setEditing(t) },
      ];
    // free or reserved — bookable/seatable
    return [
      { label: "Seat", icon: "＋", primary: true, on: () => act(t) },
      { label: "Reserve", icon: "📅", on: () => window.location.assign("/core/guest/book") },
      { label: "Edit", icon: "⋯", on: () => setEditing(t) },
    ];
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
  // Live derived counts for the dense-console stat strip — all from real floor
  // + order state (Rule #1): free tables, free four-tops, tables on an unpaid
  // bill, złoty still to clear, and seated covers.
  const floorStats = useMemo(() => {
    const tbls = twin?.tables ?? [];
    let free = 0, freeFourtops = 0, billing = 0, dueGrosze = 0, covers = 0;
    for (const t of tbls) {
      const tUnpaid = (ordersByTable.get(t.id) ?? []).filter((o) => !o.paid);
      if (tUnpaid.length > 0) { billing++; dueGrosze += tUnpaid.reduce((a, o) => a + o.totalAmount, 0); }
      if (t.occupied) covers += t.party ?? t.seats;
      else if (t.status === "available") { free++; if (t.seats >= 4) freeFourtops++; }
    }
    return { free, freeFourtops, billing, dueGrosze, covers };
  }, [twin, ordersByTable]);
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
          <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>
          <button type="button" className="cm-primary" onClick={() => setEditing("new")}><PlusIcon />Add table</button>
        </>
      }
    >
      <div className="core-guest-inbox">
        <div className="core-crumb">
          CORE — SERVICE · FLOOR · <b>liquid glass</b> · <span className="fix">{location} · dine-in</span>
        </div>
        <div className="core-sectionhead">
          <h1>Service · Floor</h1>
          <span className="sub">{s ? `${s.totalTables} tables` : "live floor"}{zones.length ? ` · ${zones.map(([z]) => z.toLowerCase()).join(" + ")}` : ""}</span>
        </div>
        {/* dense-console stat strip — every figure from live floor state (Rule #1):
            seated · free · on bill · covers · occupancy · spend velocity. */}
        <div className="core-statstrip" role="group" aria-label="Floor metrics">
          <div className="cell">
            <span className="lab">Seated</span>
            <span className="val info">{s ? s.seated : "—"}</span>
            <span className="delta">{s ? `of ${s.totalTables} tables` : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">Free</span>
            <span className="val basil">{twin ? floorStats.free : "—"}</span>
            <span className="delta">{twin ? `${floorStats.freeFourtops} four-top${floorStats.freeFourtops === 1 ? "" : "s"}` : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">On bill</span>
            <span className={floorStats.billing > 0 ? "val amber" : "val"}>{twin ? floorStats.billing : "—"}</span>
            <span className="delta">{floorStats.dueGrosze > 0 ? `${zl0(floorStats.dueGrosze)} to clear` : "settled"}</span>
          </div>
          <div className="cell">
            <span className="lab">Covers</span>
            <span className="val">{twin ? floorStats.covers : "—"}</span>
            <span className="delta">{s ? `${s.seated} table${s.seated === 1 ? "" : "s"} seated` : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">Occupancy</span>
            <span className="val">{s ? <>{Math.round(s.occupancyPct)}<small>%</small></> : "—"}</span>
            <span className="delta">{s?.freeingSoon15 ? `${s.freeingSoon15} freeing ≤15m` : "steady"}</span>
          </div>
          <div className="cell">
            <span className="lab">Spend / hr</span>
            <span className="val brand">{s?.spendVelocityPerHourGrosze != null ? zl0(s.spendVelocityPerHourGrosze) : "—"}</span>
            <span className="delta">{s?.medianTurnMin != null ? `${s.medianTurnMin}m turn` : "live"}</span>
          </div>
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
          <div className={`core-bottleneck ${kitchen.tier}`} role="status">
            <span className="bn-ic" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
            </span>
            <span className="bn-msg">
              <b>{kitchen.label ?? "Kitchen"} {kitchen.tier === "risk" ? "backed up" : "warming"}</b> — {Math.round(kitchen.util)}% loaded
              <span className="rec"> · seat new covers toward <em>a calmer station</em> and pace the floor</span>
            </span>
            <span className="bn-tag">bottleneck</span>
            <button type="button" className="bn-act" onClick={() => setParty(String(Math.max(2, partyN)))}>Pace seating</button>
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
          {zones.length > 1 && (
            <div className="core-zonetabs">
              <button type="button" className={!zoneFilter ? "core-ztab on" : "core-ztab"} onClick={() => setZoneFilter(null)}>
                All<span className="n">{zones.reduce((a, [, ts]) => a + ts.length, 0)}</span>
              </button>
              {zones.map(([z, ts]) => (
                <button key={z} type="button" className={zoneFilter === z ? "core-ztab on" : "core-ztab"} onClick={() => setZoneFilter(z)}>
                  {z}<span className="n">{ts.length}</span>
                </button>
              ))}
            </div>
          )}
          {!twin ? (
            <div className="core-ctx-empty pad">Loading floor…</div>
          ) : zones.length === 0 ? (
            <div className="core-ctx-empty pad">No tables yet — add one to start modelling the floor.</div>
          ) : (
            (zoneFilter ? zones.filter(([z]) => z === zoneFilter) : zones).map(([zone, tbls]) => (
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
                    const isFocus = selected?.kind === "table" && selected.id === t.id;
                    const foodUp = foodUpTables.has(t.id);
                    const guestOrdered = guestOrderedTables.has(t.id);
                    const allergy = !!t.notes && ALLERGY_RE.test(t.notes);
                    // Mockup tile state: an unpaid bill promotes a seated table to
                    // the amber "billing" accent; otherwise the twin's state class.
                    const billing = tUnpaid.length > 0;
                    const mockCls = billing ? "billing" : st.cls;
                    const statusText =
                      t.status === "out-of-service" ? "out of service"
                      : billing ? "billing"
                      : st.cls === "freeing" ? "freeing"
                      : t.occupied ? "seated"
                      : t.status === "reserved" ? "reserved"
                      : "free";
                    const coversLine = t.occupied ? `${t.party ?? t.seats} covers` : `${t.seats}-top`;
                    const dwellLine =
                      t.occupied ? (t.elapsedMin != null ? `${t.elapsedMin} min` : "open")
                      : t.status === "reserved" ? "reserved"
                      : t.status === "out-of-service" ? "out of service"
                      : "open";
                    const checkLine = billing
                      ? { amt: zl2(tDue), tag: "on bill" }
                      : t.occupied && t.openCheckGrosze
                        ? { amt: zl0(t.openCheckGrosze), tag: "open" }
                        : null;
                    // At most ONE glance-fact beyond number+covers and the status
                    // line — the single most urgent thing needing a human, in
                    // priority order (allergy → unpaid → note → paid → open check).
                    const urgent = foodUp ? (
                      <span className="core-tfoodup">🔔 Food up</span>
                    ) : guestOrdered ? (
                      <span className="core-tguest">🛎 Guest ordered</span>
                    ) : allergy ? (
                      <span className="core-tnote-chip alrg" title={t.notes}>⚠ {t.notes}</span>
                    ) : tUnpaid.length > 0 ? (
                      <span className="core-tpay due" title={`${tUnpaid.length} order${tUnpaid.length === 1 ? "" : "s"} to pay`}>
                        {hasQr ? "QR · " : ""}{zl2(tDue)} to pay
                      </span>
                    ) : t.notes ? (
                      <span className="core-tnote-chip" title={t.notes}>📝 {t.notes}</span>
                    ) : tOrders.length > 0 ? (
                      <span className="core-tpay paid">{hasQr ? "QR " : ""}✓ paid</span>
                    ) : null;
                    return (
                      <div key={t.id} className="core-tbl2-wrap">
                        <button
                          className={`core-tbl2 ${mockCls}${isFocus ? " is-focus" : ""}${foodUp ? " food-up" : ""}${moveFrom?.id === t.id ? " is-moving" : ""}`}
                          onClick={(e) => {
                            // In move mode, the next tap is the destination.
                            if (moveFrom) { void doMove(moveFrom, t); return; }
                            // Tap blooms the state-aware radial AND feeds the
                            // dock (so the check follows across lenses on tap).
                            select(buildSelection(t));
                            const r = e.currentTarget.getBoundingClientRect();
                            setRadial({ table: t, x: r.left + r.width / 2, y: r.top + r.height / 2 });
                          }}
                          title={`Table ${t.number} — actions`}
                        >
                          <span className="thead">
                            <span className="tnum">{t.number}</span>
                            <span className="tstat"><span className="dot" /><span className="tst">{statusText}</span></span>
                          </span>
                          <span className="tcap">{coversLine}</span>
                          <span className="tdwell">{dwellLine}</span>
                          {checkLine && <span className="tchk">{checkLine.amt} <small>{checkLine.tag}</small></span>}
                          {urgent}
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
                        {t.occupied && (
                          <button
                            type="button"
                            className="core-tbl2-clear"
                            disabled={acting === t.id}
                            onClick={(e) => { e.stopPropagation(); act(t); }}
                            title={`Free table ${t.number}`}
                            aria-label={`Free table ${t.number}`}
                          >
                            {acting === t.id ? "…" : "Free"}
                          </button>
                        )}
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

      {/* The check, docked over the floor — tap a table and its check opens here
          (no navigation). Build / modify / course / split / pay all live in the
          embedded till. Portaled to <body> so the fixed panel escapes any
          stacking context (Rule #4). */}
      {radial && coreRoot && createPortal(
        <div className="core-radial-scrim" onClick={() => setRadial(null)}>
          <div className="core-radial" style={{ left: radial.x, top: radial.y }} onClick={(e) => e.stopPropagation()}>
            <div className="core-radial-h">Table {radial.table.number}</div>
            {radialVerbs(radial.table).map((v) => (
              <button
                key={v.label}
                type="button"
                className={v.primary ? "core-radial-v primary" : "core-radial-v"}
                onClick={() => { setRadial(null); v.on(); }}
              >
                <span className="ri" aria-hidden>{v.icon}</span>{v.label}
              </button>
            ))}
          </div>
        </div>,
        coreRoot,
      )}
      {checkTable && coreRoot && createPortal(
        <div
          className="core-check-overlay"
          role="dialog"
          aria-label={`Table ${checkTable.number} check`}
          onClick={(e) => { if (e.target === e.currentTarget) setCheckTable(null); }}
        >
          <div className="core-check-panel">
            <CorePos
              embedded
              menusByLocation={menusByLocation}
              upsellByLocation={upsellByLocation}
              initialTableId={checkTable.id}
              onClose={() => { setCheckTable(null); void load(); }}
            />
          </div>
        </div>,
        coreRoot,
      )}
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
