"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreSurfToolbar } from "@/core/shell/CoreSurfToolbar";
import { RefreshIcon } from "@/core/shell/toolIcons";
import { useCoreCache, peekCoreCache } from "@/lib/useCoreCache";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { serviceTabs } from "./serviceTabs";
import type { Order } from "@/data/types";

interface Driver {
  id: string;
  name: string;
  role: string;
}

const zl = (g: number) => `${(g / 100).toFixed(2)} zł`;
const shortId = (id: string) => id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
const SLA_MS = 30 * 60 * 1000; // delivery SLA — 30 min from order creation.

/** Card visual bucket + status pill (mockup: ready / in kitchen / on the road). */
const CARD_KIND: Partial<Record<Order["status"], "ready" | "inkitchen" | "road">> = {
  confirmed: "inkitchen",
  preparing: "inkitchen",
  ready: "ready",
  assigned: "ready",
  picked_up: "road",
};
const CARD_STAT_CLASS: Record<"ready" | "inkitchen" | "road", string> = { ready: "rdy", inkitchen: "inkitchen", road: "road" };
const CARD_LABEL: Partial<Record<Order["status"], string>> = {
  confirmed: "in kitchen",
  preparing: "in kitchen",
  ready: "ready",
  assigned: "ready",
  picked_up: "on the road",
};

const PinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const ClockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M12 2a10 10 0 1 0 10 10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

/**
 * Core · Service · Dispatch — the delivery driver board. Lists active delivery
 * orders (from /api/admin/dispatch) as order-pass cards, assigns a driver in one
 * tap, and advances the delivery lifecycle (assigned → picked up → delivered)
 * by tapping the driver line. Reuses the order store primitives; no new
 * persistence. Glass-styled via theme tokens + the parity layer
 * (themes/core/parity/dispatch.css). See docs/design-system/core/modules/service.md.
 */
export function CoreDispatch() {
  const { location } = useLocation();
  const toast = useCoreToast();
  // Cached by location so returning to Dispatch re-renders the last board
  // instantly (no loading flash); the mount/poll fetch revalidates.
  const [orders, setOrders] = useCoreCache<Order[]>(`core:dispatch-orders:${location}`, []);
  const [drivers, setDrivers] = useCoreCache<Driver[]>(`core:dispatch-drivers:${location}`, []);
  const [loading, setLoading] = useState(() => peekCoreCache<Driver[]>(`core:dispatch-drivers:${location}`) === undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/dispatch?location=${encodeURIComponent(location)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: { orders?: Order[]; drivers?: Driver[] } = await res.json();
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
    } catch {
      /* transient — next poll retries */
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const mutate = useCallback(
    async (orderId: string, body: { driverId?: string | null; status?: Order["status"] }, msg: string) => {
      setBusy(orderId);
      try {
        const res = await fetch("/api/admin/dispatch", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, ...body }),
        });
        if (!res.ok) {
          toast("Couldn't update — try again", "danger");
          return;
        }
        toast(msg, "success");
        setAssigningId(null);
        await load();
      } catch {
        toast("Network error — try again", "danger");
      } finally {
        setBusy(null);
      }
    },
    [load, toast],
  );

  const driverName = useCallback((id?: string) => drivers.find((d) => d.id === id)?.name ?? "Unknown driver", [drivers]);

  const kpis = useMemo(() => {
    const preparing = orders.filter((o) => o.status === "preparing").length;
    const kitchen = orders.filter((o) => o.status === "confirmed" || o.status === "preparing").length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const road = orders.filter((o) => o.status === "assigned" || o.status === "picked_up").length;
    const unassigned = orders.filter((o) => o.status === "ready" && !o.assignedDriverId).length;
    // Delivered today — completed delivery orders dated today (real, Rule #1).
    const today = new Date().toDateString();
    const deliveredToday = orders.filter((o) => (o.status === "delivered" || o.status === "completed") && new Date(o.createdAt).toDateString() === today).length;
    // Late — active board orders past the 30-min SLA (derived from createdAt).
    const now = Date.now();
    const late = orders.filter((o) => now - new Date(o.createdAt).getTime() > SLA_MS).length;
    return { preparing, kitchen, ready, road, unassigned, deliveredToday, late };
  }, [orders]);

  // Live driver status derived from the order board — no separate driver
  // telemetry store, so status/ETA are read off real assignments (Rule #1).
  const driverState = useCallback(
    (id: string): { label: string; tone: string; meta: string; eta: string; etaTone: string } => {
      const role = drivers.find((d) => d.id === id)?.role ?? "driver";
      const o = orders.find((x) => x.assignedDriverId === id && (x.status === "assigned" || x.status === "picked_up"));
      if (!o) return { label: "idle", tone: "idle", meta: `${role} · idle at base`, eta: "— idle", etaTone: "mut" };
      const meta = [role, o.deliveryAddress, `#${shortId(o.id)}`].filter(Boolean).join(" · ");
      if (o.status === "picked_up") return { label: "en route", tone: "route", meta, eta: "in transit", etaTone: "info" };
      return { label: "loading", tone: "loading", meta, eta: "at pass", etaTone: "amber" };
    },
    [orders, drivers],
  );
  const driversOut = useMemo(
    () => drivers.filter((d) => orders.some((o) => o.assignedDriverId === d.id && (o.status === "assigned" || o.status === "picked_up"))).length,
    [drivers, orders],
  );

  // Auto-assign a specific ready order to the first idle driver.
  const autoNearest = useCallback(
    (orderId: string) => {
      const driver = drivers.find((d) => driverState(d.id).tone === "idle");
      if (!driver) {
        toast("No idle driver free", "default");
        return;
      }
      void mutate(orderId, { driverId: driver.id, status: "assigned" }, `Auto-assigned #${shortId(orderId)} → ${driver.name}`);
    },
    [drivers, driverState, mutate, toast],
  );
  // Toolbar action — earliest unassigned ready order → first idle driver.
  const autoAssignNearest = useCallback(() => {
    const order = orders.find((o) => o.status === "ready" && !o.assignedDriverId);
    if (!order) {
      toast("Nothing waiting on a driver", "default");
      return;
    }
    autoNearest(order.id);
  }, [orders, autoNearest, toast]);

  const nextStatus = (o: Order): Order["status"] | null => {
    if (!o.assignedDriverId) return null;
    if (o.status === "picked_up") return "delivered";
    return "picked_up";
  };

  return (
    <CoreShell
      eyebrow="Service · Dispatch"
      tabs={serviceTabs("dispatch")}
    >
      <div className="core-guest-inbox">
        {/* Unified ActionBar — identity (Service · Dispatch) · actions right
            (auto-assign · Refresh). */}
        <CoreSurfToolbar
          ariaLabel="Dispatch controls"
          sub={<>pass → road · {location}{clock ? ` · ${clock}` : ""}</>}
          right={
            <>
              <button type="button" className="core-qrpill" onClick={autoAssignNearest} title="Auto-assign nearest idle driver">
                <ClockIcon /> auto-assign nearest
              </button>
              <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}>
                <RefreshIcon />
              </button>
            </>
          }
        />
        {/* dense-console 6-up stat strip — every figure from the live board (Rule #1). */}
        <div className="core-statstrip" role="group" aria-label="Dispatch metrics">
          <div className="cell"><span className="lab">In kitchen</span><span className="val info">{kpis.kitchen}</span><span className="delta">{kpis.preparing} firing now</span></div>
          <div className="cell"><span className="lab">Ready</span><span className="val basil">{kpis.ready}</span><span className="delta">{kpis.unassigned} awaiting driver</span></div>
          <div className="cell"><span className="lab">On road</span><span className="val">{kpis.road}</span><span className="delta">{driversOut} assigned</span></div>
          <div className="cell"><span className="lab">Delivered today</span><span className="val">{kpis.deliveredToday}</span><span className="delta">completed</span></div>
          {/* Avg delivery — needs delivery-completion timestamps (none in the order
              model yet), so it shows a graceful em-dash. See DATA NEEDED. */}
          <div className="cell"><span className="lab">Avg delivery</span><span className="val brand">—</span><span className="delta">no timing data</span></div>
          <div className="cell"><span className="lab">Late</span><span className={kpis.late > 0 ? "val danger" : "val"}>{kpis.late}</span><span className="delta dn">SLA 30 min</span></div>
        </div>

        <div className="core-disp-grid">
          {/* LEFT — free-standing order-pass cards (no wrapping frame) */}
          <div className="core-disp-left">
            <div className="core-disp-qhead">
              <span className="t">Pass · delivery queue</span>
              <span className="fbadge">{orders.length} order{orders.length === 1 ? "" : "s"}</span>
            </div>
            {loading ? (
              <div className="core-kds-empty pad">Loading dispatch…</div>
            ) : orders.length === 0 ? (
              <div className="core-kds-empty pad">No active delivery orders. New delivery checks appear here the moment they’re confirmed.</div>
            ) : (
              <div className="core-dcards">
                {orders.map((o) => {
                  const kind = CARD_KIND[o.status] ?? "inkitchen";
                  const next = nextStatus(o);
                  const items = o.items ?? [];
                  return (
                    <div key={o.id} className={`core-dcard ${kind}`}>
                      <div className="dc-top">
                        <div className="idz">
                          <span className="oid">#{shortId(o.id)}</span>
                          {o.deliveryAddress ? (
                            <span className="zone" title={o.deliveryAddress}>
                              <PinIcon />
                              {o.deliveryAddress}
                            </span>
                          ) : null}
                        </div>
                        <span className={`core-dstat ${CARD_STAT_CLASS[kind]}`}>{CARD_LABEL[o.status] ?? o.status}</span>
                      </div>

                      <div className="dc-items">
                        {items.length > 0 ? (
                          items.map((it, idx) => (
                            <span key={idx}>
                              {idx > 0 ? " · " : ""}
                              <b>{it.quantity}×</b> {it.menuItem?.name ?? "Item"}
                            </span>
                          ))
                        ) : (
                          <span className="muted">No line items</span>
                        )}
                      </div>

                      <div className="dc-bottom">
                        <span className="val">{zl(o.totalAmount)}</span>
                        {o.assignedDriverId ? (
                          <div className="core-dc-drv">
                            <button
                              type="button"
                              className="drv"
                              disabled={busy === o.id || !next}
                              title={next === "delivered" ? "Mark delivered" : "Mark picked up"}
                              onClick={() => next && void mutate(o.id, { status: next }, next === "delivered" ? "Marked delivered" : "Marked picked up")}
                            >
                              <span className="pin" />
                              {driverName(o.assignedDriverId)}
                            </button>
                            <button
                              type="button"
                              className="core-dc-x"
                              disabled={busy === o.id}
                              title="Unassign driver"
                              aria-label="Unassign driver"
                              onClick={() => void mutate(o.id, { driverId: null }, "Driver unassigned")}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="core-dc-actions">
                            <button
                              type="button"
                              className="core-assign-btn ghost"
                              disabled={busy === o.id || drivers.length === 0}
                              onClick={() => autoNearest(o.id)}
                            >
                              Auto-nearest
                            </button>
                            <button
                              type="button"
                              className="core-assign-btn"
                              disabled={busy === o.id || drivers.length === 0}
                              onClick={() => setAssigningId((cur) => (cur === o.id ? null : o.id))}
                            >
                              ＋ Assign driver
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Assign — inline driver picker (real staff in the delivery role). */}
                      {!o.assignedDriverId && assigningId === o.id ? (
                        drivers.length === 0 ? (
                          <div className="core-dc-picker muted">No drivers on shift — add one under Staff.</div>
                        ) : (
                          <div className="core-dc-picker">
                            {drivers.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                className="core-chip"
                                disabled={busy === o.id}
                                onClick={() => void mutate(o.id, { driverId: d.id, status: "assigned" }, `Assigned to ${d.name}`)}
                              >
                                {d.name}
                              </button>
                            ))}
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT — driver roster with ETA column (status derived from the board) */}
          <aside className="core-frame core-disp-drivers">
            <div className="core-frame-h"><span className="t">Drivers</span><span className="fbadge">{drivers.length} on shift · {driversOut} out</span></div>
            <div className="core-frame-b">
              {drivers.length === 0 ? (
                <div className="core-kds-empty">No drivers on shift — add one under Staff.</div>
              ) : (
                drivers.map((d) => {
                  const st = driverState(d.id);
                  return (
                    <div className="core-disp-driver" key={d.id}>
                      <span className="core-g-av s">{d.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                      <div className="who"><div className="nm">{d.name}</div><div className="mt">{st.meta}</div></div>
                      <div className="core-roster-eta">
                        <span className={`core-disp-dstat ${st.tone}`}>{st.label}</span>
                        <span className={`eta ${st.etaTone}`}>{st.eta}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      </div>
    </CoreShell>
  );
}
