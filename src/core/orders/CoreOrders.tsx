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
const CHANNELS = ["all", "qr", "web", "whatsapp", "pos"] as const;
type ChannelFilter = (typeof CHANNELS)[number];
const CHANNEL_LABEL: Record<string, string> = { all: "All channels", web: "Web", whatsapp: "WhatsApp", qr: "QR", pos: "POS" };

const STATUS_TONE: Record<string, string> = {
  pending: "due", confirmed: "info", preparing: "info", ready: "paid", completed: "paid", cancelled: "muted",
};
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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (scope === "current" && !ACTIVE.has(o.status)) return false;
      if (scope === "paid" && !o.paidAt) return false;
      if (channel !== "all" && (o.channel ?? "web") !== channel) return false;
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
  const kpi = useMemo(() => ({
    today: todays.length,
    current: orders.filter((o) => ACTIVE.has(o.status)).length,
    toPay: orders.filter((o) => ACTIVE.has(o.status) && !o.paidAt).length,
    revenue: todays.filter((o) => o.paidAt).reduce((a, o) => a + o.totalAmount, 0),
  }), [orders, todays]);

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
        <div className="core-kpi-strip">
          <div className="k"><div className="kl">Orders today</div><div className="kv mono">{kpi.today}</div></div>
          <div className="k"><div className="kl">Current</div><div className="kv mono">{kpi.current}</div></div>
          <div className="k"><div className="kl">To pay</div><div className="kv mono" style={kpi.toPay > 0 ? { color: "var(--brand-bright)" } : undefined}>{kpi.toPay || "—"}</div></div>
          <div className="k"><div className="kl">Paid today</div><div className="kv mono">{zl2(kpi.revenue)}</div></div>
        </div>

        {/* One filter toolbar — channel · search · refresh. The Current/Paid/All
            scope now lives in the command bar's view tabs. */}
        <div className="core-floor-bar">
          <select className="core-inp" style={{ width: 150 }} value={channel} onChange={(e) => setChannel(e.target.value as ChannelFilter)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
          <input className="core-inp" style={{ flex: 1, minWidth: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="order id, guest, phone or table…" />
          <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>
        </div>

        <div className="core-orders-list">
          {!loaded ? (
            <div className="core-ctx-empty pad">Loading orders…</div>
          ) : filtered.length === 0 ? (
            <div className="core-ctx-empty pad">No orders match.</div>
          ) : (
            filtered.slice(0, 200).map((o) => {
              const t = tableNo(o);
              return (
                <button key={o.id} type="button" className="core-order-row" onClick={() => setDetail(o)}>
                  <span className="core-or-time mono">{fmtTime(o.createdAt)}<span className="core-or-date">{fmtDate(o.createdAt)}</span></span>
                  <span className="core-or-main">
                    <span className="core-or-who">{t ? `Table ${t}` : o.fulfillmentType} · {o.customerName}</span>
                    <span className="core-or-items">{o.items.reduce((a, i) => a + i.quantity, 0)} items · {o.id}</span>
                  </span>
                  <span className="core-chip" style={{ height: 22 }}>{CHANNEL_LABEL[o.channel ?? "web"] ?? o.channel}</span>
                  <span className={`core-tpay ${STATUS_TONE[o.status] ?? "muted"}`} style={{ position: "static" }}>{o.status}</span>
                  <span className={o.paidAt ? "core-tpay paid" : "core-tpay due"} style={{ position: "static" }}>{o.paidAt ? "✓ paid" : "unpaid"}</span>
                  <span className="core-or-total mono">{zl2(o.totalAmount)}</span>
                </button>
              );
            })
          )}
        </div>
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
