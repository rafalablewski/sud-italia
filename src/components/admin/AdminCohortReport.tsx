"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, TrendingUp, Users } from "lucide-react";
import { Button, Card, CardBody, EmptyState } from "./v2/ui";
import { KpiCard } from "./v2/charts";
import dynamic from "next/dynamic";
import { formatPrice } from "@/lib/utils";
import { useIsMobile } from "./v2/mobile";

const MobileCohortReport = dynamic(
  () => import("./mobile/MobileCohortReport").then((m) => m.MobileCohortReport),
  { ssr: false },
);

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
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileCohortReport />;
  }
  return <AdminCohortReportDesktop />;
}

function AdminCohortReportDesktop() {
  const [data, setData] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      await fetch("/api/admin/customer-segments", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const horizonCols = useMemo(() => {
    if (!data) return [] as number[];
    const max = Math.max(0, ...data.cohortsByMonth.map((c) => c.retention.length));
    return Array.from({ length: Math.min(13, max) }, (_, i) => i);
  }, [data]);

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading Cohort & CLTV…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <div className="v2-page-title-row">
            <h1 className="v2-page-title">Cohort retention &amp; CLTV</h1>
            <p className="v2-page-subtitle">No paid orders yet — nothing to bucket.</p>
          </div>
        </header>
        <Card>
          <CardBody>
            <EmptyState
              icon={TrendingUp}
              title="No data"
              description="Once orders start landing, every customer is bucketed by their first-paid-order month and retention rolls in here."
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Cohort retention &amp; CLTV</h1>
          <p className="v2-page-subtitle">
            Every customer is bucketed by their first-paid-order month.
            Retention shows what % of that bucket reordered N months later;
            CLTV columns are mean revenue per cohort customer through each
            horizon. Generated{" "}
            {new Date(data.generatedAt).toLocaleString("pl-PL")}.
          </p>
        </div>
        <div className="v2-page-actions">
          <Button variant="ghost" size="sm" loading={busy} onClick={rebuild}>
            <RotateCcw className="h-3.5 w-3.5" /> Rebuild segments
          </Button>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Paid customers"
          value={data.totals.customers}
          icon={Users}
          tone="info"
        />
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
      </section>

      {segmentCounts && Object.keys(segmentCounts).length > 0 && (
        <Card>
          <CardBody>
            <div className="v2-detail-head">
              <h2>Segment mix</h2>
              <span className="v2-detail-head-hint">Recomputed weekly</span>
            </div>
            <div className="v2-cohort-segments">
              {Object.entries(segmentCounts).map(([seg, n]) => (
                <div key={seg} className="v2-cohort-segment">
                  <span className="v2-cohort-segment-label">{seg}</span>
                  <span className="v2-cohort-segment-value tabular">
                    {n.toLocaleString("pl-PL")}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Retention matrix</h2>
            <span className="v2-detail-head-hint">
              Rows = cohort month · cells = % of that cohort that reordered N months later
            </span>
          </div>
          <div className="v2-cohort-table-wrap">
            <table className="v2-cohort-table">
              <thead>
                <tr>
                  <th className="v2-cohort-th-cohort">Cohort</th>
                  <th className="v2-cohort-th-num">Size</th>
                  {horizonCols.map((m) => (
                    <th key={m} className="v2-cohort-th-month">
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
                    <tr key={c.cohortMonth}>
                      <td className="v2-cohort-td-cohort tabular">
                        {c.cohortMonth}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {c.cohortSize}
                      </td>
                      {horizonCols.map((offset) => {
                        const r = c.retention[offset];
                        if (!r) return <td key={offset} className="v2-cohort-td-cell" />;
                        const pct = c.cohortSize > 0
                          ? Math.round((r.retained / c.cohortSize) * 100)
                          : 0;
                        return (
                          <td
                            key={offset}
                            className="v2-cohort-td-cell tabular"
                            style={{
                              background: pct > 0 ? heatColor(pct) : undefined,
                              color: pct > 30 ? "#fff" : undefined,
                            }}
                            title={`${r.retained}/${c.cohortSize} reordered · ${formatPrice(r.revenueGrosze)}`}
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
        <CardBody>
          <div className="v2-detail-head">
            <h2>Mean CLTV by cohort</h2>
            <span className="v2-detail-head-hint">
              Revenue per cohort customer at each horizon
            </span>
          </div>
          <div className="v2-cohort-table-wrap">
            <table className="v2-cohort-table">
              <thead>
                <tr>
                  <th className="v2-cohort-th-cohort">Cohort</th>
                  <th className="v2-cohort-th-num">Size</th>
                  <th className="v2-cohort-th-num">30d</th>
                  <th className="v2-cohort-th-num">60d</th>
                  <th className="v2-cohort-th-num">90d</th>
                  <th className="v2-cohort-th-num">180d</th>
                  <th className="v2-cohort-th-num">365d</th>
                </tr>
              </thead>
              <tbody>
                {data.cltv
                  .slice(-12)
                  .reverse()
                  .map((c) => (
                    <tr key={c.cohortMonth}>
                      <td className="v2-cohort-td-cohort tabular">
                        {c.cohortMonth}
                      </td>
                      <td className="v2-cohort-td-num tabular">{c.cohortSize}</td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv30Grosze)}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv60Grosze)}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv90Grosze)}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv180Grosze)}
                      </td>
                      <td className="v2-cohort-td-num v2-cohort-td-headline tabular">
                        {formatPrice(c.cltv365Grosze)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
