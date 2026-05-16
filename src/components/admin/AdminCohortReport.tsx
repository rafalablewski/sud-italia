"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";
import { formatPrice } from "@/lib/utils";

interface CohortRow {
  cohortMonth: string;
  cohortSize: number;
  newCustomerRevenueGrosze: number;
  retention: { monthOffset: number; retained: number; revenueGrosze: number }[];
}

interface CltvSummary {
  cohortMonth: string;
  cohortSize: number;
  cltv30Grosze: number;
  cltv60Grosze: number;
  cltv90Grosze: number;
  cltv180Grosze: number;
  cltv365Grosze: number;
}

interface CohortReport {
  generatedAt: string;
  cohortsByMonth: CohortRow[];
  cltv: CltvSummary[];
  totals: {
    customers: number;
    repeatCustomers: number;
    repeatRatePct: number;
    avgOrdersPerCustomer: number;
    medianGrossePerCustomer: number;
  };
}

const HEAT_COLORS = ["#0a3d1a", "#15613c", "#1f8055", "#28a06d", "#3bcb88", "#7be3ad"];
function heatColor(pct: number): string {
  const idx = Math.min(HEAT_COLORS.length - 1, Math.floor(pct / 20));
  return HEAT_COLORS[idx];
}

export function AdminCohortReport() {
  const [data, setData] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [report, segs] = await Promise.all([
        fetch("/api/admin/reports/cohort").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/customer-segments").then((r) => (r.ok ? r.json() : null)),
      ]);
      setData(report);
      setSegmentCounts(segs?.counts ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rebuild = async () => {
    await fetch("/api/admin/customer-segments", { method: "POST" });
    void load();
  };

  if (loading) return <div className="py-10 text-center opacity-60">Loading…</div>;
  if (!data) return <EmptyState title="No data" description="No paid orders yet." />;

  const horizonMonths = Math.max(0, ...data.cohortsByMonth.map((c) => c.retention.length));
  const horizonCols = Array.from({ length: Math.min(13, horizonMonths) }, (_, i) => i);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp size={22} /> Cohort retention & CLTV
          </h1>
          <p className="text-sm opacity-70 mt-1">
            The data moat. Every customer is bucketed by their first-paid-order month; retention
            shows what % of that bucket reordered N months later. CLTV columns are mean revenue per
            cohort customer through each horizon. Refresh after a heavy traffic day for a current view.
          </p>
        </div>
        <Button variant="ghost" onClick={rebuild}>
          Rebuild segments
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Customers (paid)" value={data.totals.customers} />
        <KpiCard
          label="Repeat customers"
          value={data.totals.repeatCustomers}
          hint={`${data.totals.repeatRatePct}% repeat rate`}
          tone={data.totals.repeatRatePct >= 25 ? "success" : "warning"}
        />
        <KpiCard
          label="Avg orders / customer"
          value={data.totals.avgOrdersPerCustomer}
          format={(n) => n.toFixed(2)}
        />
        <KpiCard
          label="Median spend"
          value={data.totals.medianGrossePerCustomer}
          display={formatPrice(data.totals.medianGrossePerCustomer)}
        />
      </div>

      {segmentCounts && (
        <Card>
          <CardHeader title="Segment mix" description="Recomputed weekly. The data moat is what these mean over time." />
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(segmentCounts).map(([seg, n]) => (
                <div
                  key={seg}
                  className="rounded border border-white/10 p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs uppercase opacity-60">{seg}</div>
                    <div className="text-xl font-semibold">{n.toLocaleString()}</div>
                  </div>
                  <Users size={18} className="opacity-40" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Retention matrix"
          description="Each row: a cohort month. Each cell: % of that cohort who reordered N months later."
        />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-3 sticky left-0 bg-inherit">Cohort</th>
                  <th className="text-right py-2 pr-3">Size</th>
                  {horizonCols.map((m) => (
                    <th key={m} className="text-center py-2 px-2 min-w-[44px]">
                      M{m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohortsByMonth
                  .slice(-18)
                  .reverse()
                  .map((c) => (
                    <tr key={c.cohortMonth} className="border-t border-white/5">
                      <td className="py-1.5 pr-3 font-mono sticky left-0 bg-inherit">{c.cohortMonth}</td>
                      <td className="py-1.5 pr-3 text-right opacity-70">{c.cohortSize}</td>
                      {horizonCols.map((offset) => {
                        const r = c.retention[offset];
                        if (!r) return <td key={offset} />;
                        const pct = c.cohortSize > 0 ? Math.round((r.retained / c.cohortSize) * 100) : 0;
                        return (
                          <td
                            key={offset}
                            className="text-center py-1.5 px-2"
                            style={{
                              background: pct > 0 ? heatColor(pct) : undefined,
                              color: pct > 30 ? "#fff" : undefined,
                            }}
                            title={`${r.retained}/${c.cohortSize} reordered (${formatPrice(r.revenueGrosze)})`}
                          >
                            {pct > 0 ? `${pct}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Mean CLTV by cohort" description="Revenue per cohort customer at each horizon." />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="opacity-70">
                  <th className="text-left py-2 pr-3">Cohort</th>
                  <th className="text-right py-2 px-2">Size</th>
                  <th className="text-right py-2 px-2">30d</th>
                  <th className="text-right py-2 px-2">60d</th>
                  <th className="text-right py-2 px-2">90d</th>
                  <th className="text-right py-2 px-2">180d</th>
                  <th className="text-right py-2 px-2">365d</th>
                </tr>
              </thead>
              <tbody>
                {data.cltv.slice(-12).reverse().map((c) => (
                  <tr key={c.cohortMonth} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 font-mono">{c.cohortMonth}</td>
                    <td className="py-1.5 px-2 text-right opacity-70">{c.cohortSize}</td>
                    <td className="py-1.5 px-2 text-right">{formatPrice(c.cltv30Grosze)}</td>
                    <td className="py-1.5 px-2 text-right">{formatPrice(c.cltv60Grosze)}</td>
                    <td className="py-1.5 px-2 text-right">{formatPrice(c.cltv90Grosze)}</td>
                    <td className="py-1.5 px-2 text-right">{formatPrice(c.cltv180Grosze)}</td>
                    <td className="py-1.5 px-2 text-right">
                      <Badge tone="success">{formatPrice(c.cltv365Grosze)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="text-xs opacity-50">
        Generated at {new Date(data.generatedAt).toLocaleString("pl-PL")}.
      </div>
    </div>
  );
}
