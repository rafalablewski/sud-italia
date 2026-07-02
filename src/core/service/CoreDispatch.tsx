"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { RefreshIcon } from "@/core/shell/toolIcons";
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

const STATUS_LABEL: Partial<Record<Order["status"], string>> = {
  confirmed: "Confirmed",
  preparing: "In kitchen",
  ready: "Ready",
  assigned: "Assigned",
  picked_up: "On the road",
};
const STATUS_TONE: Partial<Record<Order["status"], string>> = {
  preparing: "var(--amber)",
  ready: "var(--basil)",
  assigned: "var(--info)",
  picked_up: "var(--brand-bright, var(--brand))",
};

/**
 * Core · Service · Dispatch — the delivery driver board. Lists active delivery
 * orders (from /api/admin/dispatch), assigns a driver in one tap, and advances
 * the delivery lifecycle (assigned → picked up → delivered). Reuses the order
 * store primitives; no new persistence. Glass-styled via theme tokens so it
 * follows the active Core skin. See docs/design-system/core/modules/service.md.
 */
export function CoreDispatch() {
  const { location } = useLocation();
  const toast = useCoreToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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
    const kitchen = orders.filter((o) => o.status === "confirmed" || o.status === "preparing").length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const road = orders.filter((o) => o.status === "assigned" || o.status === "picked_up").length;
    const unassigned = orders.filter((o) => o.status === "ready" && !o.assignedDriverId).length;
    // Delivered today — completed delivery orders dated today (real, Rule #1).
    const today = new Date().toDateString();
    const deliveredToday = orders.filter((o) => (o.status === "delivered" || o.status === "completed") && new Date(o.createdAt).toDateString() === today).length;
    return { kitchen, ready, road, unassigned, deliveredToday };
  }, [orders]);

  // Live driver status derived from the order board (en route / loading / idle) —
  // no separate driver-telemetry store, so it's read off real assignments.
  const driverState = useCallback((id: string): { label: string; tone: string; sub: string } => {
    const o = orders.find((x) => x.assignedDriverId === id && (x.status === "assigned" || x.status === "picked_up"));
    if (!o) return { label: "idle", tone: "idle", sub: "— idle" };
    if (o.status === "picked_up") return { label: "en route", tone: "route", sub: `#${shortId(o.id)}` };
    return { label: "loading", tone: "loading", sub: `at pass · #${shortId(o.id)}` };
  }, [orders]);
  const driversOut = useMemo(() => drivers.filter((d) => orders.some((o) => o.assignedDriverId === d.id && (o.status === "assigned" || o.status === "picked_up"))).length, [drivers, orders]);
  // Auto-assign the earliest unassigned ready order to the first idle driver.
  const autoAssignNearest = useCallback(() => {
    const order = orders.find((o) => o.status === "ready" && !o.assignedDriverId);
    const driver = drivers.find((d) => driverState(d.id).tone === "idle");
    if (!order || !driver) { toast(order ? "No idle driver free" : "Nothing waiting on a driver", "default"); return; }
    void mutate(order.id, { driverId: driver.id, status: "assigned" }, `Auto-assigned #${shortId(order.id)} → ${driver.name}`);
  }, [orders, drivers, driverState, mutate, toast]);

  const nextStatus = (o: Order): Order["status"] | null => {
    if (!o.assignedDriverId) return null;
    if (o.status === "picked_up") return "delivered";
    return "picked_up";
  };

  return (
    <CoreShell
      eyebrow="Service · Dispatch"
      tabs={serviceTabs("dispatch")}
      subRight={
        <>
          <button type="button" className="core-pill qr" onClick={autoAssignNearest} title="Auto-assign nearest idle driver">⚡ Auto-assign nearest</button>
          <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}>
            <RefreshIcon />
          </button>
        </>
      }
    >
      <div className="core-guest-inbox">
        <div className="core-crumb">
          CORE — SERVICE · DISPATCH · <b>liquid glass</b> · <span className="fix">pass → road</span>
        </div>
        <div className="core-sectionhead">
          <h1>Service · Dispatch</h1>
          <span className="sub">{location} · pass → road</span>
        </div>
        {/* dense-console 6-up stat strip — every figure from the live board (Rule #1). */}
        <div className="core-statstrip" role="group" aria-label="Dispatch metrics">
          <div className="cell"><span className="lab">In kitchen</span><span className="val amber">{kpis.kitchen}</span><span className="delta">cooking</span></div>
          <div className="cell"><span className="lab">Ready</span><span className="val basil">{kpis.ready}</span><span className="delta">{kpis.unassigned} awaiting driver</span></div>
          <div className="cell"><span className="lab">On road</span><span className="val info">{kpis.road}</span><span className="delta">{driversOut} assigned</span></div>
          <div className="cell"><span className="lab">Delivered today</span><span className="val">{kpis.deliveredToday}</span><span className="delta">completed</span></div>
          <div className="cell"><span className="lab">Drivers</span><span className="val brand">{drivers.length}</span><span className="delta">{driversOut} out · {drivers.length - driversOut} idle</span></div>
          <div className="cell"><span className="lab">Unassigned</span><span className={kpis.unassigned > 0 ? "val danger" : "val"}>{kpis.unassigned}</span><span className={kpis.unassigned > 0 ? "delta dn" : "delta"}>{kpis.unassigned > 0 ? "need a driver" : "all covered"}</span></div>
        </div>

        <div className="core-disp-grid">
          <div className="core-disp-queue">
            <div className="core-frame-h"><span className="t">Pass · delivery queue</span><span className="fbadge">{orders.length} order{orders.length === 1 ? "" : "s"}</span></div>
            {loading ? (
              <div className="core-kds-empty pad">Loading dispatch…</div>
            ) : orders.length === 0 ? (
              <div className="core-kds-empty pad">No active delivery orders. New delivery checks appear here the moment they’re confirmed.</div>
            ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, padding: 10 }}>
            {orders.map((o) => {
              const next = nextStatus(o);
              const tone = STATUS_TONE[o.status] ?? "var(--ink-3)";
              return (
                <div
                  key={o.id}
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--line-2)",
                    borderRadius: "var(--r-lg, 16px)",
                    padding: 16,
                    boxShadow: "var(--sh-1), inset 0 1px 0 rgba(255,255,255,.14)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 }}>#{shortId(o.id)}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: ".04em",
                        color: tone,
                        border: `1px solid ${tone}`,
                        borderRadius: 999,
                        padding: "3px 9px",
                      }}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>

                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", margin: "8px 0" }}>
                    {o.deliveryAddress ? (
                      <span style={{ color: "var(--ink)" }}>{o.deliveryAddress}</span>
                    ) : (
                      <span style={{ color: "var(--ink-3)" }}>No address on file</span>
                    )}
                  </div>
                  <div className="mono" style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>
                    {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? "" : "s"} · {zl(o.totalAmount)}
                    {o.customerName ? ` · ${o.customerName}` : ""}
                  </div>

                  {/* driver assignment */}
                  {o.assignedDriverId ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--ink)",
                          background: "var(--info-wash, rgba(84,188,224,.16))",
                          border: "1px solid var(--info)",
                          borderRadius: 999,
                          padding: "6px 12px",
                        }}
                      >
                        🛵 {driverName(o.assignedDriverId)}
                      </span>
                      <button
                        type="button"
                        className="core-btn ghost sm"
                        disabled={busy === o.id}
                        onClick={() => void mutate(o.id, { driverId: null }, "Driver unassigned")}
                      >
                        Unassign
                      </button>
                    </div>
                  ) : drivers.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10 }}>
                      No drivers on shift — add one under Staff.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
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
                  )}

                  {/* advance */}
                  <button
                    type="button"
                    className="core-btn primary"
                    style={{ width: "100%" }}
                    disabled={busy === o.id || !next}
                    onClick={() => next && void mutate(o.id, { status: next }, next === "delivered" ? "Marked delivered" : "Marked picked up")}
                  >
                    {!o.assignedDriverId
                      ? "Assign a driver first"
                      : next === "delivered"
                        ? "✓ Mark delivered"
                        : "→ Mark picked up"}
                  </button>
                </div>
              );
            })}
          </div>
            )}
          </div>

          {/* Drivers panel — status derived live from the order board */}
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
                      <div className="who"><div className="nm">{d.name}</div><div className="mt">{d.role} · {st.sub}</div></div>
                      <span className={`core-disp-dstat ${st.tone}`}>{st.label}</span>
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
