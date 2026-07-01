"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { useCoreToast } from "@/core/ui/Toast";
import { CoreDialog } from "@/core/ui/Dialog";
import { QrIcon } from "@/core/shell/toolIcons";

interface QrOrderRow {
  id: string;
  status: string;
  paid: boolean;
  customerName: string;
  partySize: number | null;
  tableNumber: string | null;
  totalAmount: number;
  itemCount: number;
  lines: { name: string; quantity: number }[];
  createdAt: string;
}

const fmtPLN = (g: number) => `${(g / 100).toFixed(2)} zł`;
const QR_TIP_PCTS = [0, 5, 10, 15];

/** Tender for settling a guest QR order — the same money model as a POS check,
 *  scoped to a single payment (tip + method + cash change). */
type QrTender = {
  tipGrosze?: number;
  method: "cash" | "card";
  cashTenderedGrosze?: number;
};
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m}m ago`;
};

/**
 * POS QR-order queue. Surfaces the dine-in orders guests placed by scanning
 * the table QR (channel "qr") so the till can take payment + acknowledge
 * them. Polls /api/admin/pos/qr-orders; "Mark paid" settles an order
 * (fires a demo-mode pending order to the kitchen). Mounted in the POS
 * sub-header.
 */
export function CoreQrQueue({ location }: { location: string }) {
  const [orders, setOrders] = useState<QrOrderRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [settleFor, setSettleFor] = useState<string | null>(null);
  const [view, setView] = useState<"orders" | "qr">("orders");
  const [tableInput, setTableInput] = useState("");
  const toast = useCoreToast();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const qrTable = tableInput.trim();
  const qrSrc = `/api/admin/qr-code?location=${encodeURIComponent(location)}&table=${encodeURIComponent(qrTable)}&base=${encodeURIComponent(origin)}`;
  const printQr = () => {
    const w = window.open("", "_blank", "width=420,height=580");
    if (!w) { toast("Allow pop-ups to print", "danger"); return; }
    // Escape every interpolated value written into the print document — the
    // table label is staff free-text, so treat it as untrusted (no DOM XSS).
    const esc = (s: string) => s.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c] ?? c));
    const t = esc(qrTable);
    const loc = esc(location);
    const src = esc(qrSrc);
    w.document.write(
      `<!doctype html><html><head><title>QR · ${t ? `Table ${t}` : loc}</title>` +
        `<style>body{margin:0;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}` +
        `.c{text-align:center;padding:28px}.c h1{margin:0 0 4px;font-size:26px;letter-spacing:.5px}` +
        `.c p{margin:0 0 16px;color:#555;font-size:14px}.c img{width:300px;height:300px}` +
        `.c h2{margin:14px 0 0;font-size:20px}</style></head><body>` +
        `<div class="c"><h1>Ottaviano</h1><p>Scan to order &amp; pay at your table</p>` +
        `<img src="${src}" alt="QR"/>${t ? `<h2>Table ${t}</h2>` : ""}</div>` +
        `<script>window.onload=function(){setTimeout(function(){window.print()},350)}</script></body></html>`,
    );
    w.document.close();
  };

  const load = useCallback(async () => {
    if (!location) return;
    try {
      const r = await fetch(`/api/admin/pos/qr-orders?location=${location}`);
      if (!r.ok) return;
      const d = await r.json();
      setOrders(Array.isArray(d.orders) ? d.orders : []);
    } catch {
      /* offline — keep last list */
    }
  }, [location]);

  usePolling(load, 8000, { enabled: !!location });

  const settle = async (id: string, tender?: QrTender) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/pos/qr-orders?location=${location}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, action: "settle", ...(tender ? { tender } : {}) }),
      });
      if (r.ok) {
        const tip = tender?.tipGrosze ? ` · +tip ${fmtPLN(tender.tipGrosze)}` : "";
        toast(`QR order settled${tip}`, "success");
        setSettleFor(null);
        await load();
      } else {
        toast("Could not settle order", "danger");
      }
    } catch {
      toast("Network error", "danger");
    } finally {
      setBusy(null);
    }
  };

  const unpaid = orders.filter((o) => !o.paid).length;

  return (
    <>
      <button
        type="button"
        className={unpaid > 0 ? "core-iconbtn on" : "core-iconbtn"}
        onClick={() => setOpen(true)}
        title={
          orders.length > 0
            ? `QR table orders — ${unpaid > 0 ? `${unpaid} to pay` : `${orders.length} open`}`
            : "In-restaurant QR table orders"
        }
        aria-label="QR table orders"
      >
        <QrIcon />
        {orders.length > 0 && <span>{unpaid > 0 ? unpaid : orders.length}</span>}
      </button>

      {open && (
        <CoreDialog open onClose={() => setOpen(false)} title="QR table orders" width={520}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button type="button" className={view === "orders" ? "core-chip on" : "core-chip"} onClick={() => setView("orders")}>
              Orders{orders.length > 0 ? ` · ${orders.length}` : ""}
            </button>
            <button type="button" className={view === "qr" ? "core-chip on" : "core-chip"} onClick={() => setView("qr")}>
              Print table QR
            </button>
          </div>

          {view === "qr" ? (
            <div style={{ display: "grid", gap: 14, justifyItems: "center", paddingBottom: 6 }}>
              <label style={{ width: "100%", display: "grid", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
                Table number / label
                <input
                  value={tableInput}
                  onChange={(e) => setTableInput(e.target.value)}
                  placeholder="e.g. 12"
                  style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px", color: "inherit", fontSize: 16 }}
                />
              </label>
              <div style={{ background: "#fff", padding: 12, borderRadius: 12, lineHeight: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="Table QR code" width={240} height={240} />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", textAlign: "center", wordBreak: "break-all" }}>
                {origin}/qr?location={location}{qrTable ? `&table=${qrTable}` : ""}
              </div>
              <button type="button" className="core-charge" style={{ height: 40, padding: "0 22px" }} onClick={printQr}>
                Print QR
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: "28px 6px", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
              No QR orders yet. Guests who scan a table QR appear here to take payment.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {orders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{o.tableNumber ? `Table ${o.tableNumber}` : "Dine-in"}</strong>
                    <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{o.customerName}</span>
                    {o.partySize ? <span style={{ fontSize: 12, color: "var(--ink-3)" }}>· {o.partySize} guests</span> : null}
                    <span
                      className={o.paid ? "core-chip on" : "core-chip"}
                      style={{ marginLeft: "auto", height: 24, fontSize: 11, textTransform: "capitalize" }}
                    >
                      {o.paid ? "paid" : "unpaid"} · {o.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    {o.lines.map((l) => `${l.quantity}× ${l.name}`).join(" · ")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{ago(o.createdAt)}</span>
                    <strong className="mono" style={{ marginLeft: "auto", fontSize: 15 }}>{fmtPLN(o.totalAmount)}</strong>
                    {!o.paid && settleFor !== o.id && (
                      <button type="button" className="core-charge" style={{ height: 36, padding: "0 16px" }} disabled={busy === o.id} onClick={() => setSettleFor(o.id)}>
                        {busy === o.id ? "…" : "Take payment"}
                      </button>
                    )}
                  </div>
                  {!o.paid && settleFor === o.id && (
                    <QrTenderPanel
                      total={o.totalAmount}
                      busy={busy === o.id}
                      onCancel={() => setSettleFor(null)}
                      onConfirm={(tender) => void settle(o.id, tender)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CoreDialog>
      )}
    </>
  );
}

/** Inline tender for a guest QR order — method, tip, and cash change-due. Mirrors
 *  the POS tender sheet's money model, scoped to a single payment (the order is
 *  already on the kitchen line, so there is no split/comp here). */
function QrTenderPanel({
  total,
  busy,
  onCancel,
  onConfirm,
}: {
  total: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (tender: QrTender) => void;
}) {
  const [method, setMethod] = useState<"cash" | "card">("card");
  const [tipPct, setTipPct] = useState(0);
  const [cashGiven, setCashGiven] = useState("");
  const tip = Math.round((total * tipPct) / 100);
  const due = total + tip;
  const cashGivenG = Math.round((parseFloat(cashGiven.replace(",", ".")) || 0) * 100);
  const change = method === "cash" ? Math.max(0, cashGivenG - due) : 0;
  const shortCash = method === "cash" && cashGivenG > 0 && cashGivenG < due;

  return (
    <div className="core-qr-tender">
      <div className="core-tender-chips">
        <div className="core-seg sm">
          <button type="button" className={method === "card" ? "on" : ""} onClick={() => setMethod("card")}>💳 Card</button>
          <button type="button" className={method === "cash" ? "on" : ""} onClick={() => setMethod("cash")}>💵 Cash</button>
        </div>
      </div>
      <div className="core-tender-chips" style={{ marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)", alignSelf: "center" }}>Tip</span>
        {QR_TIP_PCTS.map((p) => (
          <button key={p} type="button" className={`core-tchip${tipPct === p ? " on" : ""}`} onClick={() => setTipPct(p)}>
            {p === 0 ? "None" : `${p}%`}
          </button>
        ))}
      </div>
      {method === "cash" && (
        <div className="core-tender-chips" style={{ marginTop: 8 }}>
          {[due, Math.ceil(due / 1000) * 1000, Math.ceil(due / 5000) * 5000]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((v) => (
              <button key={v} type="button" className="core-tchip" onClick={() => setCashGiven((v / 100).toFixed(2))}>{fmtPLN(v)}</button>
            ))}
          <input className="core-inp tip-inp" inputMode="decimal" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder="cash zł" />
          {change > 0 && <span style={{ alignSelf: "center", fontSize: 12, fontWeight: 600, color: "var(--basil)" }}>change {fmtPLN(change)}</span>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="core-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="core-charge"
          style={{ flex: 1, height: 38 }}
          disabled={busy || shortCash}
          onClick={() =>
            onConfirm({
              method,
              ...(tip > 0 ? { tipGrosze: tip } : {}),
              ...(method === "cash" && cashGivenG > 0 ? { cashTenderedGrosze: cashGivenG } : {}),
            })
          }
        >
          {busy ? "…" : shortCash ? `Need ${fmtPLN(due)}` : `Settle ${fmtPLN(due)}`}
        </button>
      </div>
    </div>
  );
}
