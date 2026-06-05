"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Repeat, Users, Wallet } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Badge, Dialog, Kpi, Table, type ColumnV3 } from "./ui";

interface CustomerSummary {
  phone: string;
  name: string;
  email?: string;
  totalSpent: number; // grosze
  orderCount: number;
  lastOrderAt?: string;
}

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "2-digit" }) : "—";
}

export function CustomersV3() {
  const [list, setList] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<CustomerSummary | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/customers").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const arr: CustomerSummary[] = Array.isArray(res) ? res : Array.isArray(res?.customers) ? res.customers : [];
    setList(arr);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? list.filter((c) => c.name.toLowerCase().includes(needle) || c.phone.includes(needle)) : list;
    return [...filtered].sort((a, b) => b.totalSpent - a.totalSpent);
  }, [list, q]);

  const totalCustomers = list.length;
  const repeat = list.filter((c) => c.orderCount >= 2).length;
  const totalRevenue = list.reduce((s, c) => s + c.totalSpent, 0);

  const cols: ColumnV3<CustomerSummary>[] = [
    { key: "name", header: "Customer", render: (c) => <span style={{ fontWeight: 600 }}>{c.name || "—"}</span> },
    { key: "phone", header: "Phone", render: (c) => <span className="av3-cell-muted mono" style={{ fontFamily: "var(--av3-mono)" }}>{c.phone}</span> },
    { key: "orders", header: "Orders", num: true, render: (c) => c.orderCount.toLocaleString("pl-PL") },
    { key: "spent", header: "Total spent", num: true, render: (c) => formatPrice(c.totalSpent) },
    { key: "last", header: "Last order", render: (c) => <span className="av3-cell-muted">{fmtDate(c.lastOrderAt)}</span> },
    { key: "tag", header: "", render: (c) => (c.orderCount >= 2 ? <Badge tone="ok">Repeat</Badge> : <Badge tone="neutral">New</Badge>) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Customers</h1>
          <div className="av3-pagehead-sub">Phone-based directory · derived from real orders</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Customers" icon={Users} value={totalCustomers.toLocaleString("pl-PL")} accentVar="--av3-c3" />
        <Kpi label="Repeat" icon={Repeat} value={`${repeat}`} accentVar="--av3-c4" />
        <Kpi label="Lifetime revenue" icon={Wallet} value={formatPrice(totalRevenue)} accentVar="--av3-c2" />
      </div>

      <div className="av3-toolbar">
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 260, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…" />
        <span className="av3-toolbar-spacer" />
        <span className="av3-cell-muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
      </div>

      {loading && list.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading customers…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No customers</div><div className="av3-empty-text">{q ? "No match for that search." : "Customers appear here once orders are placed."}</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(c) => c.phone} onRowClick={(c) => setDetail(c)} />
          )}
        </div>
      )}

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name || "Customer"}
        subtitle={detail?.phone}
        headerExtra={detail ? (detail.orderCount >= 2 ? <Badge tone="ok">Repeat</Badge> : <Badge tone="neutral">New</Badge>) : undefined}
        width={440}
      >
        {detail && (
          <div className="av3-od-grid">
            <div className="av3-od-field"><div className="k">Orders</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{detail.orderCount}</div></div>
            <div className="av3-od-field"><div className="k">Total spent</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(detail.totalSpent)}</div></div>
            <div className="av3-od-field"><div className="k">Avg order</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(detail.orderCount ? Math.round(detail.totalSpent / detail.orderCount) : 0)}</div></div>
            <div className="av3-od-field"><div className="k">Last order</div><div className="v">{fmtDate(detail.lastOrderAt)}</div></div>
            {detail.email && <div className="av3-od-field" style={{ gridColumn: "1 / -1" }}><div className="k">Email</div><div className="v">{detail.email}</div></div>}
          </div>
        )}
      </Dialog>
    </>
  );
}
