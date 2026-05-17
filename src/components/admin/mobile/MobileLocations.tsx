"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, MapPin, PiggyBank, TrendingUp } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import {
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  Section,
} from "../v2/mobile";

type Period = "today" | "7d" | "30d" | "90d";

interface LocationComparison {
  locationSlug: string;
  city: string;
  revenue: number;
  profit: number;
  profitMargin: number;
  orderCount: number;
  avgOrderValue: number;
  cancellationRate: number;
}

const PERIOD_DAYS: Record<Period, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
function isoDate(d: Date) { return d.toISOString().split("T")[0]; }
function dateRange(p: Period) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (PERIOD_DAYS[p] - 1));
  return { from: isoDate(from), to: isoDate(to) };
}
function fmtZl(grosze: number) {
  const zl = grosze / 100;
  if (Math.abs(zl) >= 1000) return `${(zl / 1000).toFixed(1)}k zł`;
  return `${Math.round(zl).toLocaleString("pl-PL")} zł`;
}

/** Mobile multi-location comparison — one card per location with mini-bars. */
export function MobileLocations() {
  const [period, setPeriod] = useState<Period>("7d");
  const [rows, setRows] = useState<LocationComparison[]>([]);

  const refresh = async () => {
    const { from, to } = dateRange(period);
    const locs = getActiveLocations();
    const data = await Promise.all(
      locs.map(async (l) => {
        const r = await fetch(`/api/admin/analytics?from=${from}&to=${to}&location=${l.slug}`);
        if (!r.ok) return null;
        const j = await r.json();
        return { ...j, locationSlug: l.slug, city: l.city } as LocationComparison;
      }),
    );
    setRows(data.filter((x): x is LocationComparison => x !== null));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const maxRevenue = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.revenue), 0),
    [rows],
  );

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <SegmentControl<Period>
            value={period}
            onChange={setPeriod}
            options={[
              { value: "today", label: "Today" },
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
            ]}
            ariaLabel="Period"
          />
        }
      >
        <PageHeader
          title="Multi-location"
          subtitle={`${rows.length} location${rows.length === 1 ? "" : "s"}`}
        />

        <Section title="Revenue league">
          {rows.length === 0 ? (
            <div className="v2-m-empty">
              <div className="v2-m-empty-title">No data</div>
            </div>
          ) : (
            <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {[...rows].sort((a, b) => b.revenue - a.revenue).map((r) => {
                const pct = maxRevenue ? (r.revenue / maxRevenue) * 100 : 0;
                return (
                  <li key={r.locationSlug}>
                    <div
                      style={{
                        padding: 14,
                        background: "var(--surface-1)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--m-card-radius)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <MapPin className="h-4 w-4" aria-hidden style={{ color: "var(--brand)" }} />
                          <span style={{ fontWeight: 500, fontSize: 15, textTransform: "capitalize" }}>{r.city}</span>
                        </div>
                        <span className="tabular" style={{ fontSize: 16, fontWeight: 600 }}>
                          {fmtZl(r.revenue)}
                        </span>
                      </div>
                      <span
                        aria-hidden
                        style={{
                          display: "block",
                          height: 4,
                          background: "var(--surface-3)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            width: `${pct}%`,
                            height: "100%",
                            background: "var(--brand)",
                            transition: "width 220ms cubic-bezier(0.32,0.72,0,1)",
                          }}
                        />
                      </span>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <KV icon={<TrendingUp className="h-3 w-3" />} label="Orders" value={r.orderCount.toLocaleString("pl-PL")} />
                        <KV icon={<Banknote className="h-3 w-3" />} label="AOV" value={fmtZl(r.avgOrderValue)} />
                        <KV icon={<PiggyBank className="h-3 w-3" />} label="Margin" value={`${r.profitMargin.toFixed(1)}%`} />
                      </div>
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

function KV({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--fg-subtle)", display: "flex", alignItems: "center", gap: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.04 }}>
        <span aria-hidden>{icon}</span> {label}
      </div>
      <div className="tabular" style={{ fontWeight: 500 }}>{value}</div>
    </div>
  );
}
