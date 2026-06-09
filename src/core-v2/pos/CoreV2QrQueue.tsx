"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";

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
export function CoreV2QrQueue({ location }: { location: string }) {
  const [orders, setOrders] = useState<QrOrderRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useCoreToast();

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

  const settle = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/pos/qr-orders?location=${location}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, action: "settle" }),
      });
      if (r.ok) {
        toast("QR order settled", "success");
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
        className={unpaid > 0 ? "cv-chip on" : "cv-chip"}
        style={{ height: 32 }}
        onClick={() => setOpen(true)}
        title="In-restaurant QR table orders"
      >
        ▦ QR{orders.length > 0 ? <> · {unpaid > 0 ? `${unpaid} to pay` : orders.length}</> : null}
      </button>

      {open && (
        <CoreV2Dialog open onClose={() => setOpen(false)} title="QR table orders" width={520}>
          {orders.length === 0 ? (
            <div style={{ padding: "28px 6px", textAlign: "center", color: "var(--ink-3, #8a857f)", fontSize: 14 }}>
              No QR orders yet. Guests who scan a table QR appear here to take payment.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {orders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    border: "1px solid var(--line, rgba(255,255,255,.12))",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{o.tableNumber ? `Table ${o.tableNumber}` : "Dine-in"}</strong>
                    <span style={{ fontSize: 12.5, color: "var(--ink-2, #b9b4ae)" }}>{o.customerName}</span>
                    {o.partySize ? <span style={{ fontSize: 12, color: "var(--ink-3, #8a857f)" }}>· {o.partySize} guests</span> : null}
                    <span
                      className={o.paid ? "cv-chip on" : "cv-chip"}
                      style={{ marginLeft: "auto", height: 24, fontSize: 11, textTransform: "capitalize" }}
                    >
                      {o.paid ? "paid" : "unpaid"} · {o.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2, #b9b4ae)", lineHeight: 1.5 }}>
                    {o.lines.map((l) => `${l.quantity}× ${l.name}`).join(" · ")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11.5, color: "var(--ink-3, #8a857f)" }}>{ago(o.createdAt)}</span>
                    <strong className="mono" style={{ marginLeft: "auto", fontSize: 15 }}>{fmtPLN(o.totalAmount)}</strong>
                    {!o.paid && (
                      <button type="button" className="cv-charge" style={{ height: 36, padding: "0 16px" }} disabled={busy === o.id} onClick={() => settle(o.id)}>
                        {busy === o.id ? "…" : "Mark paid"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CoreV2Dialog>
      )}
    </>
  );
}
