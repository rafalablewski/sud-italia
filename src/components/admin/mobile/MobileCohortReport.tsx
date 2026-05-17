"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  MobilePage,
  PageHeader,
  PullToRefresh,
  Section,
  StatRow,
  type StatItem,
} from "../v2/mobile";

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

function fmtZl(grosze: number): string {
  const zl = grosze / 100;
  if (Math.abs(zl) >= 1000) return `${(zl / 1000).toFixed(1)}k zł`;
  return `${Math.round(zl).toLocaleString("pl-PL")} zł`;
}
function fmtMonth(m: string): string {
  return new Date(`${m}-01T00:00:00`).toLocaleDateString([], {
    month: "short",
    year: "2-digit",
  });
}

/**
 * Mobile cohort report. Desktop renders a 12×12 cohort matrix that is
 * unreadable below tablet. On a phone we surface the *headlines* —
 * repeat rate, CLTV, top cohorts — and let the operator drill into a
 * specific cohort row to see its 6-month retention curve.
 */
export function MobileCohortReport() {
  const [data, setData] = useState<CohortReport | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/admin/reports/cohort");
    if (!r.ok) return;
    setData(await r.json());
  };

  useEffect(() => { refresh(); }, []);

  if (!data) {
    return (
      <MobilePage>
        <PageHeader title="Cohort" subtitle="Loading…" />
      </MobilePage>
    );
  }

  const stats: StatItem[] = [
    {
      label: "Repeat rate",
      value: `${data.totals.repeatRatePct.toFixed(1)}%`,
      icon: Users,
      tone: "brand",
      hint: `${data.totals.repeatCustomers} of ${data.totals.customers}`,
    },
    {
      label: "Avg orders / customer",
      value: data.totals.avgOrdersPerCustomer.toFixed(2),
      tone: "info",
    },
    {
      label: "Median LTV",
      value: fmtZl(data.totals.medianGrossePerCustomer),
      tone: "success",
    },
  ];

  const cohorts = [...data.cohortsByMonth].reverse(); // newest first
  const cltvByMonth = new Map(data.cltv.map((c) => [c.cohortMonth, c]));

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage>
        <PageHeader
          title="Cohort & CLTV"
          subtitle={`Generated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        />

        <StatRow items={stats} />

        <Section title={`Cohorts (${cohorts.length})`}>
          {cohorts.length === 0 ? (
            <div className="v2-m-empty">
              <div className="v2-m-empty-title">No cohorts yet</div>
            </div>
          ) : (
            <ul role="list" className="v2-m-list">
              {cohorts.slice(0, 12).map((c) => {
                const ltv = cltvByMonth.get(c.cohortMonth);
                const ret6 = c.retention.find((r) => r.monthOffset === 6);
                const retained6Pct = c.cohortSize
                  ? Math.round(((ret6?.retained ?? 0) / c.cohortSize) * 100)
                  : 0;
                return (
                  <li key={c.cohortMonth}>
                    <div className="v2-m-list-row" style={{ alignItems: "flex-start" }}>
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title">{fmtMonth(c.cohortMonth)}</span>
                        <span className="v2-m-list-sub">
                          {c.cohortSize} customers · {fmtZl(c.newCustomerRevenueGrosze)} first-order
                        </span>
                        <RetentionStrip retention={c.retention} cohortSize={c.cohortSize} />
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                        <span className="v2-m-list-metric tabular">{ltv ? fmtZl(ltv.cltv180Grosze) : "—"}</span>
                        <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>180d LTV</span>
                        <span className={`v2-m-pill ${retained6Pct >= 30 ? "v2-m-pill-success" : retained6Pct >= 15 ? "v2-m-pill-warning" : "v2-m-pill-danger"}`} style={{ marginTop: 4 }}>
                          {retained6Pct}% @ 6mo
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </MobilePage>
    </PullToRefresh>
  );
}

function RetentionStrip({
  retention,
  cohortSize,
}: {
  retention: { monthOffset: number; retained: number }[];
  cohortSize: number;
}) {
  const cells = Array.from({ length: 6 }, (_, i) => {
    const hit = retention.find((r) => r.monthOffset === i + 1);
    const pct = cohortSize ? ((hit?.retained ?? 0) / cohortSize) * 100 : 0;
    return { pct };
  });
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
        gap: 3,
        marginTop: 6,
      }}
      aria-hidden
    >
      {cells.map((c, i) => (
        <span
          key={i}
          title={`M${i + 1}: ${c.pct.toFixed(0)}%`}
          style={{
            height: 6,
            borderRadius: 2,
            background: `color-mix(in oklab, var(--brand) ${Math.min(100, c.pct * 2)}%, var(--surface-3))`,
          }}
        />
      ))}
    </div>
  );
}
