"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, MapPin, Percent } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { BarChart, type BarDatum, Card, CardBody, CardHead, ChartLegend, type ColumnV3, Donut, type DonutDatum, Kpi, KpiRail, SkeletonRows, Table } from "./ui";

const SITE_PALETTE = ["--av3-c1", "--av3-c3", "--av3-c4", "--av3-c2", "--av3-c5", "--av3-c6"];

interface LocCmp {
  locationSlug: string;
  city: string;
  revenue: number;
  profit: number;
  profitMargin: number;
  orderCount: number;
  avgOrderValue: number;
  cancellationRate: number;
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export function MultiLocationV3() {
  const [rows, setRows] = useState<LocCmp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = isoDate(new Date());
    const from = isoDate(new Date(Date.now() - 30 * 86400000));
    fetch(`/api/admin/insights?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((d) => { setRows(Array.isArray(d?.locationComparison) ? d.locationComparison : []); setLoading(false); });
  }, []);

  const totals = useMemo(() => ({
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    orders: rows.reduce((s, r) => s + r.orderCount, 0),
    margin: rows.length ? rows.reduce((s, r) => s + r.profitMargin, 0) / rows.length : 0,
  }), [rows]);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.revenue - a.revenue), [rows]);

  // Revenue values stay in grosze (the donut only needs proportions; the
  // legend + centre format with formatPrice).
  const revShare = useMemo<DonutDatum[]>(
    () => sorted.map((r, i) => ({ label: r.city, value: r.revenue, colorVar: SITE_PALETTE[i % SITE_PALETTE.length] })),
    [sorted],
  );
  const ordersByCity = useMemo<BarDatum[]>(
    () => sorted.map((r, i) => ({ label: r.city, value: r.orderCount, colorVar: SITE_PALETTE[i % SITE_PALETTE.length] })),
    [sorted],
  );

  const cols: ColumnV3<LocCmp>[] = [
    { key: "city", header: "Location", render: (r) => <span style={{ fontWeight: 600 }}>{r.city}</span> },
    { key: "rev", header: "Revenue", num: true, render: (r) => formatPrice(r.revenue) },
    { key: "profit", header: "Profit", num: true, render: (r) => formatPrice(r.profit) },
    { key: "margin", header: "Margin", num: true, render: (r) => `${r.profitMargin.toFixed(1)}%` },
    { key: "orders", header: "Orders", num: true, render: (r) => r.orderCount.toLocaleString("pl-PL") },
    { key: "aov", header: "AOV", num: true, render: (r) => formatPrice(r.avgOrderValue) },
    { key: "cancel", header: "Cancel", num: true, render: (r) => `${r.cancellationRate.toFixed(1)}%` },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Multi-location</h1>
          <div className="av3-pagehead-sub">Cross-site performance · last 30 days</div>
        </div>
      </div>

      <KpiRail loading={loading} empty={rows.length === 0}>
        <Kpi label="Chain revenue" icon={Banknote} value={formatPrice(totals.revenue)} accentVar="--av3-c1" />
        <Kpi label="Chain orders" icon={MapPin} value={totals.orders.toLocaleString("pl-PL")} accentVar="--av3-c3" />
        <Kpi label="Avg margin" icon={Percent} value={`${totals.margin.toFixed(1)}%`} accentVar="--av3-c4" />
      </KpiRail>

      {!loading && sorted.length > 0 && (
        <div className="av3-grid-2">
          <Card>
            <CardHead title="Revenue share" description="Each site's slice of chain revenue" />
            <CardBody>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <Donut data={revShare} size={150} centerValue={formatPrice(totals.revenue)} centerLabel="CHAIN" />
                <ChartLegend items={revShare} format={(n) => `${formatPrice(n)} · ${totals.revenue ? Math.round((n / totals.revenue) * 100) : 0}%`} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHead title="Orders by site" description="Order volume · last 30 days" />
            <CardBody><BarChart data={ordersByCity} height={150} /></CardBody>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {sorted.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No location data</div><div className="av3-empty-text">Comparison appears once locations have orders.</div></div>
          ) : (
            <Table columns={cols} rows={sorted} rowKey={(r) => r.locationSlug} />
          )}
        </div>
      )}
    </>
  );
}
