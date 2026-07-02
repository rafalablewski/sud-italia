"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { CoreShell } from "@/core/shell/CoreShell";
import { RefreshIcon } from "@/core/shell/toolIcons";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import type { Order } from "@/data/types";

type Scope = "current" | "paid" | "all";
const ACTIVE = new Set(["pending", "confirmed", "preparing", "ready"]);
// Dense-console channel chips (mockup): fulfillment types + the QR guest
// channel. `takeaway` maps to the model's `takeout` fulfillment type.
const CHANS = ["all", "dine-in", "takeaway", "delivery", "qr"] as const;
type ChannelFilter = (typeof CHANS)[number];
const CHANNEL_LABEL: Record<string, string> = { all: "All channels", web: "Web", whatsapp: "WhatsApp", qr: "QR", pos: "POS" };
const FULFILLMENT_LABEL: Record<string, string> = { "dine-in": "dine-in", takeout: "takeaway", delivery: "delivery" };
const FULFILLMENT_CLASS: Record<string, string> = { "dine-in": "dinein", takeout: "takeaway", delivery: "delivery" };

// Order status → the mockup's `.stpill` tone bucket.
const STATUS_PILL: Record<string, string> = {
  pending: "new", confirmed: "new", preparing: "preparing", ready: "ready", completed: "paid", cancelled: "cancelled",
};
const zl0 = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")}`;
const zl2 = (g: number) => `${(g / 100).toFixed(2)} zł`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });

/**
 * Print the simulator's plain-text receipt through the browser (popup → print
 * dialog) — the no-hardware fallback documented in receipt-printer.md. The
 * preview is rendered as text (never HTML) so a guest name or item note can't
 * inject markup. Returns false if the popup was blocked.
 */
function browserPrintReceipt(preview: string, orderId: string): boolean {
  const w = window.open("", "_blank", "width=360,height=640");
  if (!w) return false;
  w.document.title = `Receipt ${orderId}`;
  const style = w.document.createElement("style");
  style.textContent =
    '@page{margin:6mm}body{margin:0}pre{font-family:ui-monospace,"JetBrains Mono",Menlo,monospace;font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-word}';
  w.document.head.appendChild(style);
  const pre = w.document.createElement("pre");
  pre.textContent = preview;
  w.document.body.appendChild(pre);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

/**
 * Core · Orders — one place for every order at the location: live (current)
 * and paid history. Scope tabs + channel filter + search (id / guest / phone /
 * table), a KPI strip, and a detail dialog with the full ticket + Mark paid +
 * Print receipt. Reads /api/admin/orders (all orders) + /api/admin/floor/tables
 * (table numbers); settles via /api/admin/floor/orders; prints via
 * /api/admin/orders/[id]/print-receipt (ESC/POS, browser fallback when no
 * RECEIPT_PRINTER_HOST).
 */
export function CoreOrders() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  const [orders, setOrders] = useState<Order[]>([]);
  const [tableById, setTableById] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<Scope>("current");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Order | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([
        fetch(`/api/admin/orders?location=${encodeURIComponent(loc)}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`).then((r) => (r.ok ? r.json() : [])),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setTableById(Object.fromEntries((Array.isArray(t) ? t : []).map((x: { id: string; number: string }) => [x.id, x.number])));
    } catch {
      /* non-fatal */
    } finally {
      setLoaded(true);
    }
  }, [loc]);
  useEffect(() => { void load(); }, [load]);
  usePolling(load, 15000);

  const settle = async (orderId: string) => {
    if (settling) return;
    setSettling(orderId);
    try {
      const res = await fetch(`/api/admin/floor/orders?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "settle" }),
      });
      if (res.ok) { toast("Order settled", "success"); await load(); }
      else toast("Could not settle order", "danger");
    } finally {
      setSettling(null);
    }
  };

  const printRcpt = async (orderId: string) => {
    if (printing) return;
    setPrinting(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/print-receipt`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast(data?.error || "Could not print receipt", "danger"); return; }
      if (data?.mode === "printed") {
        toast(data?.message || "Receipt printed", "success");
      } else {
        const opened = typeof data?.preview === "string" ? browserPrintReceipt(data.preview, orderId) : false;
        toast(opened ? "Receipt sent to the print dialog" : "Receipt ready — allow pop-ups to print it", opened ? "success" : "danger");
      }
    } catch {
      toast("Could not print receipt", "danger");
    } finally {
      setPrinting(null);
    }
  };

  const tableNo = (o: Order) => (o.tableId ? tableById[o.tableId] ?? null : null);

  const chanMatch = (o: Order, c: ChannelFilter) => {
    if (c === "all") return true;
    if (c === "qr") return (o.channel ?? "web") === "qr";
    if (c === "takeaway") return o.fulfillmentType === "takeout";
    return o.fulfillmentType === c; // "dine-in" | "delivery"
  };
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (scope === "current" && !ACTIVE.has(o.status)) return false;
      if (scope === "paid" && !o.paidAt) return false;
      if (!chanMatch(o, channel)) return false;
      if (query) {
        const hay = `${o.id} ${o.customerName} ${o.customerPhone} ${tableNo(o) ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, scope, channel, q, tableById]);

  const todays = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((o) => new Date(o.createdAt).toDateString() === today);
  }, [orders]);
  // Dense-console stat strip — every figure from live order state (Rule #1).
  const kpi = useMemo(() => {
    const active = orders.filter((o) => ACTIVE.has(o.status));
    const paidToday = todays.filter((o) => o.paidAt);
    const revenue = paidToday.reduce((a, o) => a + o.totalAmount, 0);
    const refunded = todays.filter((o) => o.refund);
    const n = Math.max(1, todays.length);
    const byType = (t: string) => todays.filter((o) => o.fulfillmentType === t).length;
    const dineIn = byType("dine-in"), takeaway = byType("takeout"), delivery = byType("delivery");
    return {
      open: active.length,
      toPay: active.filter((o) => !o.paidAt).length,
      revenue,
      avg: paidToday.length ? Math.round(revenue / paidToday.length) : 0,
      refunds: refunded.length,
      refundTotal: refunded.reduce((a, o) => a + (o.refund?.amount ?? 0), 0),
      dineIn, takeaway, delivery,
      dineInPct: Math.round((dineIn / n) * 100),
      takeawayPct: Math.round((takeaway / n) * 100),
      deliveryPct: Math.round((delivery / n) * 100),
    };
  }, [orders, todays]);

  return (
    <CoreShell
      eyebrow="Orders · live & history"
      tabs={(["current", "paid", "all"] as Scope[]).map((s) => ({
        label: s === "current" ? "Current" : s === "paid" ? "Paid" : "All",
        active: scope === s,
        onClick: () => setScope(s),
      }))}
    >
      <div className="core-guest-inbox">
        <div className="core-crumb">
          CORE — ORDERS · <b>liquid glass</b> · <span className="fix">cross-cutting surface</span>
        </div>
        <div className="core-sectionhead">
          <h1>Orders</h1>
          <span className="sub">{location} · {scope === "current" ? "live" : scope === "paid" ? "paid history" : "all orders"}</span>
        </div>
        {/* dense-console 7-up stat strip — every figure from live order state (Rule #1). */}
        <div className="core-statstrip" role="group" aria-label="Order metrics">
          <div className="cell">
            <span className="lab">Open orders</span>
            <span className="val">{kpi.open}</span>
            <span className={kpi.toPay > 0 ? "delta warn" : "delta"}>{kpi.toPay > 0 ? `${kpi.toPay} to pay` : "all settled"}</span>
          </div>
          <div className="cell">
            <span className="lab">Revenue today</span>
            <span className="val brand">{zl0(kpi.revenue)}<small> zł</small></span>
            <span className="delta">{todays.filter((o) => o.paidAt).length} paid</span>
          </div>
          <div className="cell">
            <span className="lab">Avg check</span>
            <span className="val basil">{zl0(kpi.avg)}<small> zł</small></span>
            <span className="delta">per paid order</span>
          </div>
          <div className="cell">
            <span className="lab">Refunds</span>
            <span className={kpi.refunds > 0 ? "val danger" : "val"}>{kpi.refunds}</span>
            <span className={kpi.refunds > 0 ? "delta dn" : "delta"}>{kpi.refunds > 0 ? `−${zl0(kpi.refundTotal)} zł` : "none today"}</span>
          </div>
          <div className="cell">
            <span className="lab">Dine-in</span>
            <span className="val info">{kpi.dineInPct}<small>%</small></span>
            <span className="delta">{kpi.dineIn} order{kpi.dineIn === 1 ? "" : "s"}</span>
          </div>
          <div className="cell">
            <span className="lab">Takeaway</span>
            <span className="val amber">{kpi.takeawayPct}<small>%</small></span>
            <span className="delta">{kpi.takeaway} order{kpi.takeaway === 1 ? "" : "s"}</span>
          </div>
          <div className="cell">
            <span className="lab">Delivery</span>
            <span className="val">{kpi.deliveryPct}<small>%</small></span>
            <span className="delta">{kpi.delivery} order{kpi.delivery === 1 ? "" : "s"}</span>
          </div>
        </div>

        {/* dense-console filterbar — search · channel chips · date · refresh.
            The Current/Paid/All scope lives in the command bar's view tabs. */}
        <div className="core-filterbar">
          <div className="core-searchfield">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="id · guest · phone · table" aria-label="Search orders" />
          </div>
          <div className="core-chanset" role="group" aria-label="Channel filter">
            {CHANS.map((c) => (
              <span key={c} className={channel === c ? `core-chan on${c === "all" ? " brand" : ""}` : "core-chan"} role="button" tabIndex={0}
                onClick={() => setChannel(c)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setChannel(c); } }}>
                {c}
              </span>
            ))}
          </div>
          <div className="core-datefield" title="Today">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M8 2v4M16 2v4M3 8h18M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /></svg>
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
          <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>
        </div>

        {!loaded ? (
          <div className="core-ctx-empty pad">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="core-ctx-empty pad">No orders match.</div>
        ) : (
          <div className="core-otable">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Time</th><th>Channel</th><th>Guest</th><th>Table</th><th>Items</th><th className="r">Total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((o) => {
                  const t = tableNo(o);
                  const isQr = (o.channel ?? "web") === "qr";
                  const chanCls = isQr ? "qr" : FULFILLMENT_CLASS[o.fulfillmentType] ?? "";
                  const chanLbl = isQr ? "qr" : FULFILLMENT_LABEL[o.fulfillmentType] ?? o.fulfillmentType;
                  const items = o.items.map((i) => `${i.quantity}× ${i.menuItem.name}`).join(" · ");
                  return (
                    <tr key={o.id} className={detail?.id === o.id ? "sel" : undefined} onClick={() => setDetail(o)}>
                      <td className="id">#{o.id}</td>
                      <td className="tm">{fmtTime(o.createdAt)}</td>
                      <td><span className={`core-chanchip ${chanCls}`}>{chanLbl}</span></td>
                      <td className="guest">{o.customerName || "—"}</td>
                      <td className={t ? "otbl" : "otbl none"}>{t ? `T${t}` : "—"}</td>
                      <td className="items" title={items}>{items}</td>
                      <td className="total">{zl2(o.totalAmount)}</td>
                      <td><span className={`core-stpill ${STATUS_PILL[o.status] ?? "paid"}`}>{o.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <CoreDialog open onClose={() => setDetail(null)} title={`Order ${detail.id}`} width={520}
          footer={
            <>
              <button type="button" className="core-btn" disabled={printing === detail.id} onClick={() => void printRcpt(detail.id)}>
                {printing === detail.id ? "…" : "Print receipt"}
              </button>
              {!detail.paidAt ? (
                <button type="button" className="core-btn primary" disabled={settling === detail.id} onClick={() => void settle(detail.id)}>
                  {settling === detail.id ? "…" : "Mark paid"}
                </button>
              ) : <span className="core-tpay paid" style={{ position: "static", alignSelf: "center" }}>✓ paid</span>}
            </>
          }>
          <div className="core-od-head">
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{tableNo(detail) ? `Table ${tableNo(detail)}` : detail.fulfillmentType}{detail.partySize ? ` · ${detail.partySize} guests` : ""}</div>
              <div className="core-cust-sub">{detail.customerName} · {detail.customerPhone}</div>
              <div className="core-cust-sub">{fmtDate(detail.createdAt)} {fmtTime(detail.createdAt)} · {CHANNEL_LABEL[detail.channel ?? "web"]} · <span style={{ textTransform: "capitalize" }}>{detail.status}</span></div>
            </div>
          </div>
          {/* status timeline — placed → fired → ready → paid, from live order state */}
          {(() => {
            const steps = [
              { lbl: "Placed", done: true, tm: fmtTime(detail.createdAt) },
              { lbl: "Fired", done: ["preparing", "ready", "completed"].includes(detail.status), tm: undefined as string | undefined },
              { lbl: "Ready", done: ["ready", "completed"].includes(detail.status), tm: undefined as string | undefined },
              { lbl: "Paid", done: !!detail.paidAt, tm: detail.paidAt ? fmtTime(detail.paidAt) : undefined },
            ];
            const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), 0);
            return (
              <div className="core-od-track" role="list">
                {steps.map((s, i) => (
                  <div key={s.lbl} className={`step${s.done ? " done" : ""}${i === lastDone && !detail.paidAt ? " at" : ""}`} role="listitem">
                    <span className="dot" />
                    <span className="lbl">{s.lbl}</span>
                    <span className="tm">{s.tm ?? "—"}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="core-od-lines">
            {detail.items.map((i, idx) => (
              <div key={idx} className="core-od-line">
                <span className="core-od-q mono">{i.quantity}×</span>
                <span style={{ flex: 1 }}>{i.menuItem.name}{i.notes ? <span className="core-cust-sub"> — {i.notes}</span> : null}</span>
                <span className="mono">{zl2(i.menuItem.price * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="core-od-total"><span>Total</span><strong className="mono">{zl2(detail.totalAmount)}</strong></div>
        </CoreDialog>
      )}
    </CoreShell>
  );
}
