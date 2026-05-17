"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Send, Truck } from "lucide-react";
import type { PurchaseOrderStatus } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useToast } from "../v2/ui/Toast";
import {
  BottomSheet,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  type MobileListItem,
} from "../v2/mobile";

interface PORow {
  id: string;
  supplierId: string;
  supplierName: string;
  locationSlug: string;
  status: PurchaseOrderStatus;
  lineCount: number;
  totalCents: number;
  expectedAt?: string;
  receivedAt?: string;
  createdAt: string;
  lines: { name?: string; unit?: string; quantity: number; lineTotal?: number }[];
}

const STATUS_TONE: Record<PurchaseOrderStatus, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral",
  sent: "info",
  received: "success",
  cancelled: "danger",
};

type Filter = "all" | PurchaseOrderStatus;

const FILTERS: Filter[] = ["all", "draft", "sent", "received", "cancelled"];

/** Mobile purchase orders — read + status advance (send / mark received). */
export function MobilePurchaseOrders() {
  const toast = useToast();
  const [rows, setRows] = useState<PORow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<PORow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/admin/purchase-orders");
    if (!r.ok) return;
    const data = await r.json();
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const advance = async (po: PORow, status: PurchaseOrderStatus) => {
    setBusy(po.id);
    try {
      const r = await fetch(`/api/admin/purchase-orders/${po.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        toast.error("Could not update");
        return;
      }
      toast.success(status === "sent" ? "PO sent" : status === "received" ? "PO received" : "Updated");
      refresh();
      setDetail(null);
    } finally {
      setBusy(null);
    }
  };

  const items: MobileListItem<PORow>[] = filtered.map((po) => ({
    id: po.id,
    data: po,
    icon: FileText,
    iconTone: STATUS_TONE[po.status],
    title: po.supplierName,
    subtitle: `#${po.id.slice(-6)} · ${po.lineCount} item${po.lineCount === 1 ? "" : "s"} · ${po.locationSlug}`,
    trailing: formatPrice(po.totalCents),
    status: { label: po.status, tone: STATUS_TONE[po.status] },
    onTap: () => setDetail(po),
  }));

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <SegmentControl<Filter>
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              value: f,
              label: `${f === "all" ? "All" : f} (${f === "all" ? rows.length : rows.filter((r) => r.status === f).length})`,
            }))}
            ariaLabel="PO status"
          />
        }
      >
        <PageHeader title="Purchase orders" subtitle={`${filtered.length} of ${rows.length}`} />
        <MobileList items={items} virtualizeAt={64} />
      </MobilePage>

      <BottomSheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `PO #${detail.id.slice(-6)}` : ""}
        size="full"
        footer={
          detail ? (
            <div style={{ display: "flex", gap: 6, flex: 1 }}>
              {detail.status === "draft" && (
                <button
                  type="button"
                  className="v2-m-btn v2-m-btn-primary"
                  style={{ flex: 1 }}
                  disabled={busy === detail.id}
                  onClick={() => advance(detail, "sent")}
                >
                  <Send className="h-4 w-4" aria-hidden /> Send
                </button>
              )}
              {detail.status === "sent" && (
                <button
                  type="button"
                  className="v2-m-btn v2-m-btn-primary"
                  style={{ flex: 1 }}
                  disabled={busy === detail.id}
                  onClick={() => advance(detail, "received")}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark received
                </button>
              )}
            </div>
          ) : null
        }
      >
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                padding: 12,
                background: "var(--surface-2)",
                borderRadius: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Supplier</div>
                <div>{detail.supplierName}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Location</div>
                <div>{detail.locationSlug}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Total</div>
                <div className="tabular" style={{ fontWeight: 500 }}>{formatPrice(detail.totalCents)}</div>
              </div>
              {detail.expectedAt && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Expected</div>
                  <div className="tabular">{new Date(detail.expectedAt).toLocaleDateString()}</div>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", marginBottom: 6 }}>
                Lines
              </div>
              <ul role="list" className="v2-m-list">
                {detail.lines.map((l, i) => (
                  <li key={i}>
                    <div className="v2-m-list-row">
                      <span className="v2-m-list-icon v2-m-tone-neutral">
                        <Truck className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title">{l.name || "—"}</span>
                        <span className="v2-m-list-sub tabular">
                          {l.quantity} {l.unit ?? ""}
                        </span>
                      </span>
                      <span className="v2-m-list-metric tabular">
                        {formatPrice(l.lineTotal ?? 0)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </BottomSheet>
    </PullToRefresh>
  );
}
