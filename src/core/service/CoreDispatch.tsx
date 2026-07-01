"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
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
    return { kitchen, ready, road };
  }, [orders]);

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
        <button type="button" className="core-iconbtn" title="Refresh" onClick={() => void load()}>
          ⟳
        </button>
      }
    >
      <div style={{ padding: 16, overflow: "auto" }}>
        {/* KPI strip */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { l: "In kitchen", v: kpis.kitchen, c: "var(--amber)" },
            { l: "Ready to go", v: kpis.ready, c: "var(--basil)" },
            { l: "On the road", v: kpis.road, c: "var(--info)" },
          ].map((k) => (
            <div
              key={k.l}
              style={{
                flex: "1 1 120px",
                minWidth: 120,
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md, 12px)",
                padding: "11px 15px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.14)",
              }}
            >
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-3)" }}>{k.l}</div>
              <div className="mono" style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, marginTop: 2, color: k.c }}>
                {k.v}
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--ink-3)" }}>Loading dispatch…</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--ink-3)" }}>
            No active delivery orders. New delivery checks appear here the moment they’re confirmed.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
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
    </CoreShell>
  );
}
