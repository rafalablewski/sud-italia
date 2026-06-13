"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, ClipboardList, Coins, Download, Percent, PiggyBank, Receipt } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { AreaChart, BarChart, Badge, Button, Card, CardBody, CardHead, ChartLegend, ChipRow, Donut, Kpi, KpiRail, Skeleton, SkeletonKpiRail, Table, type BarDatum, type ColumnV3, type DonutDatum } from "./ui";

type Preset = "7d" | "30d" | "90d";
const PRESET_DAYS: Record<Preset, number> = { "7d": 7, "30d": 30, "90d": 90 };
const PRESET_OPTS: { value: Preset; label: string }[] = [
  { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "90d", label: "90d" },
];

interface DailyStat {
  date: string; revenue: number; cost: number; profit: number; orderCount: number; avgOrderValue: number;
  itemCount: number; takeoutCount: number; deliveryCount: number; dineInCount: number;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => {
      const v = String(cell ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
interface Summary {
  totalRevenue: number; totalCost: number; totalProfit: number; profitMargin: number;
  totalOrders: number; avgOrderValue: number;
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
  // Already returned by /api/admin/analytics — the v3 board now reads them too.
  dailyStats?: DailyStat[];
  takeoutCount?: number; deliveryCount?: number; dineInCount?: number;
}

// Stable channel → colour-token map so the donut + legend agree.
const CHANNEL_COLORS: Record<string, string> = { "Dine-in": "--av3-c1", Takeout: "--av3-c3", Delivery: "--av3-c4", WhatsApp: "--av3-c2" };
interface Tips { totals: { totalTipGrosze: number; totalTippedOrders: number; averageTipRate: number; averageTipPerOrder: number } }

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export function ReportsV3() {
  const { location } = useAdminLocationV3();
  const [preset, setPreset] = useState<Preset>("30d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tips, setTips] = useState<Tips | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const to = new Date(); const from = new Date();
    from.setDate(to.getDate() - (PRESET_DAYS[preset] - 1));
    return { from: isoDate(from), to: isoDate(to) };
  }, [preset]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const locParam = location ? `&location=${location}` : "";
    const [a, t] = await Promise.all([
      fetch(`/api/admin/analytics?from=${range.from}&to=${range.to}${locParam}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/reports/tips?from=${range.from}&to=${range.to}${locParam}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setSummary(a); setTips(t); setLoading(false);
  }, [range, location]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const categories = useMemo(() => {
    const m = summary?.categoryBreakdown ?? {};
    return Object.entries(m).map(([name, v]) => ({ name, revenue: v.revenue, count: v.count })).sort((a, b) => b.revenue - a.revenue);
  }, [summary]);
  const catMax = Math.max(1, ...categories.map((c) => c.revenue));
  const topItems = (summary?.topItems ?? []).slice(0, 10);

  // Inline-SVG chart inputs, all from the same analytics payload (real data).
  const revenueTrend = useMemo(() => (summary?.dailyStats ?? []).map((d) => Math.round(d.revenue / 100)), [summary]);
  const ordersTrend = useMemo<BarDatum[]>(() => (summary?.dailyStats ?? []).map((d) => ({ label: d.date.slice(5), value: d.orderCount })), [summary]);
  const channelMix = useMemo<DonutDatum[]>(() => {
    const raw = [
      { label: "Dine-in", value: summary?.dineInCount ?? 0 },
      { label: "Takeout", value: summary?.takeoutCount ?? 0 },
      { label: "Delivery", value: summary?.deliveryCount ?? 0 },
    ];
    return raw.filter((r) => r.value > 0).map((r) => ({ label: r.label, value: r.value, colorVar: CHANNEL_COLORS[r.label] ?? "--av3-c3" }));
  }, [summary]);
  const channelTotal = channelMix.reduce((s, c) => s + c.value, 0);
  const lastRevenue = summary?.dailyStats?.length ? summary.dailyStats[summary.dailyStats.length - 1].revenue : 0;

  const exportJpk = () => {
    const locParam = location ? `&location=${location}` : "";
    window.location.href = `/api/admin/reports/jpk?from=${range.from}&to=${range.to}${locParam}`;
  };

  const exportCsv = () => {
    const days = summary?.dailyStats ?? [];
    if (!days.length) return;
    downloadCsv(`reports-${range.from}_${range.to}.csv`, [
      ["Date", "Revenue (PLN)", "Cost (PLN)", "Profit (PLN)", "Margin %", "Orders", "Items", "AOV (PLN)", "Takeout", "Delivery", "Dine-in"],
      ...days.map((d) => [
        d.date,
        (d.revenue / 100).toFixed(2), (d.cost / 100).toFixed(2), (d.profit / 100).toFixed(2),
        d.revenue > 0 ? (((d.revenue - d.cost) / d.revenue) * 100).toFixed(1) : "0.0",
        d.orderCount, d.itemCount, (d.avgOrderValue / 100).toFixed(2),
        d.takeoutCount, d.deliveryCount, d.dineInCount,
      ]),
    ]);
  };

  const itemCols: ColumnV3<{ name: string; quantity: number; revenue: number }>[] = [
    { key: "n", header: "Item", render: (i) => <span style={{ fontWeight: 500 }}>{i.name}</span> },
    { key: "q", header: "Sold", num: true, render: (i) => i.quantity.toLocaleString("pl-PL") },
    { key: "r", header: "Revenue", num: true, render: (i) => formatPrice(i.revenue) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Reports</h1>
          <div className="av3-pagehead-sub">{location ? "Single site" : "All sites"} · {range.from} → {range.to}</div>
        </div>
        <div className="av3-pagehead-actions">
          <ChipRow options={PRESET_OPTS} value={preset} onChange={setPreset} ariaLabel="Range" />
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!summary?.dailyStats?.length}><Download className="av3-btn-ico" /> CSV</Button>
          <Button variant="secondary" size="sm" onClick={exportJpk}><Download className="av3-btn-ico" /> JPK export</Button>
        </div>
      </div>

      {loading && !summary ? (
        <>
          <SkeletonKpiRail count={6} />
          <Card><CardBody><Skeleton height={150} radius={8} /></CardBody></Card>
        </>
      ) : (
        <>
          <KpiRail>
            <Kpi label="Revenue" icon={Banknote} value={formatPrice(summary?.totalRevenue ?? 0)} accentVar="--av3-c1" />
            <Kpi label="Gross profit" icon={PiggyBank} value={formatPrice(summary?.totalProfit ?? 0)} accentVar="--av3-c4" />
            <Kpi label="Margin" icon={Percent} value={`${(summary?.profitMargin ?? 0).toFixed(0)}%`} accentVar="--av3-c4" />
            <Kpi label="Orders" icon={ClipboardList} value={(summary?.totalOrders ?? 0).toLocaleString("pl-PL")} accentVar="--av3-c3" />
            <Kpi label="Avg order" icon={Receipt} value={formatPrice(summary?.avgOrderValue ?? 0)} accentVar="--av3-c2" />
            <Kpi label="Tips" icon={Coins} value={formatPrice(tips?.totals.totalTipGrosze ?? 0)} accentVar="--av3-c5" />
          </KpiRail>

          <Card>
            <CardHead title="Revenue trend" description={`Daily revenue · ${range.from} → ${range.to}`} />
            <CardBody>
              <AreaChart
                data={revenueTrend}
                height={170}
                accentVar="--av3-c1"
                labels={(summary?.dailyStats ?? []).map((d) => d.date.slice(5))}
                format={(n) => formatPrice(n * 100)}
                caption={[range.from, `today · ${formatPrice(lastRevenue)}`]}
              />
            </CardBody>
          </Card>

          <div className="av3-grid-2">
            <Card>
              <CardHead title="Channel mix" description="Orders by fulfilment" />
              <CardBody>
                {channelMix.length === 0 ? (
                  <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No orders in range.</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                    <Donut data={channelMix} size={150} centerValue={channelTotal.toLocaleString("pl-PL")} centerLabel="ORDERS" />
                    <ChartLegend items={channelMix} format={(n) => `${n} · ${Math.round((n / channelTotal) * 100)}%`} />
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHead title="Orders / day" description="Order volume across the window" />
              <CardBody>
                {ordersTrend.length === 0 ? (
                  <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No orders in range.</div>
                ) : (
                  <BarChart data={ordersTrend} height={170} accentVar="--av3-c3" />
                )}
              </CardBody>
            </Card>
          </div>

          <div className="av3-grid-2">
            <Card>
              <CardHead title="Revenue by category" />
              <CardBody>
                {categories.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No sales in range.</div> : (
                  <div className="av3-bars">
                    {categories.map((c) => (
                      <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 12, alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 12, textTransform: "capitalize", marginBottom: 4 }}>{c.name}</div>
                          <div className="av3-bar-track"><div className="av3-bar-fill" style={{ width: `${(c.revenue / catMax) * 100}%` }} /></div>
                        </div>
                        <div className="av3-bar-val">{formatPrice(c.revenue)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHead title="Tips" description="Server-recorded gratuity" />
              <CardBody>
                <div className="av3-od-grid">
                  <div className="av3-od-field"><div className="k">Total tips</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(tips?.totals.totalTipGrosze ?? 0)}</div></div>
                  <div className="av3-od-field"><div className="k">Tipped orders</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{tips?.totals.totalTippedOrders ?? 0}</div></div>
                  <div className="av3-od-field"><div className="k">Avg tip rate</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{((tips?.totals.averageTipRate ?? 0) * 100).toFixed(1)}%</div></div>
                  <div className="av3-od-field"><div className="k">Avg / order</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(tips?.totals.averageTipPerOrder ?? 0)}</div></div>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card style={{ padding: 0 }}>
            <CardHead title="Top items" actions={<Badge tone="neutral">top {topItems.length}</Badge>} />
            {topItems.length === 0 ? <CardBody><div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No items sold in range.</div></CardBody> : (
              <Table columns={itemCols} rows={topItems} rowKey={(i) => i.name} />
            )}
          </Card>
        </>
      )}
    </>
  );
}
