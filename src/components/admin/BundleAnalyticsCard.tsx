"use client";

import { useEffect, useState } from "react";
import { Sparkles, TrendingUp, AlertCircle } from "lucide-react";

interface BundleAnalytics {
  windowDays: number;
  totalBundleOrders: number;
  totalBundleRevenueGrosze: number;
  totalSavingsGrosze: number;
  byBundle: {
    bundleId: string;
    bundleName: string;
    count: number;
    avgFinalGrosze: number;
    avgSavingsGrosze: number;
    avgMainsCount: number;
    totalRevenueGrosze: number;
    totalSavingsGrosze: number;
    effectiveDiscount: number;
  }[];
  byVariant: {
    variantId: string;
    count: number;
    avgFinalGrosze: number;
    avgSavingsGrosze: number;
    totalRevenueGrosze: number;
  }[];
}

const zl = (g: number) => `zł ${(g / 100).toFixed(2)}`;

/**
 * Sprint 3 KPI tile — bundle penetration, per-tier mix, decoy CTR proxy,
 * A/B variant uplift. The QSR-audit Tier-1 dashboard metrics surfaced
 * inline on AdminReports so the operator sees them every shift.
 */
export function BundleAnalyticsCard({ locationSlug, days = 30 }: { locationSlug?: string; days?: number }) {
  const [data, setData] = useState<BundleAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (locationSlug) qs.set("location", locationSlug);
    qs.set("days", String(days));
    fetch(`/api/admin/bundle-analytics?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: BundleAnalytics) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setErr(typeof e === "string" ? e : "Failed to load bundle analytics");
        setLoading(false);
      });
  }, [locationSlug, days]);

  if (loading) {
    return <div className="glass-card p-4 text-sm admin-text-secondary">Loading bundle analytics…</div>;
  }
  if (err || !data) {
    return (
      <div className="glass-card p-4 text-sm text-red-300 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {err ?? "No data"}
      </div>
    );
  }

  // Anchor conversion = anchor tier orders / total bundle orders.
  // Decoy click = decoy tier orders / total. Healthy ladder: anchor ≥ 55%, decoy ≤ 12%.
  const anchorRow = data.byBundle.find((b) => b.bundleId === "family-feast");
  const decoyRow = data.byBundle.find((b) => b.bundleId === "family-deluxe");
  const anchorPct = data.totalBundleOrders > 0 && anchorRow
    ? (anchorRow.count / data.totalBundleOrders) * 100
    : 0;
  const decoyPct = data.totalBundleOrders > 0 && decoyRow
    ? (decoyRow.count / data.totalBundleOrders) * 100
    : 0;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-italia-gold" />
        <h3 className="font-heading font-bold text-base admin-text">
          Bundle analytics
        </h3>
        <span className="text-[10px] admin-text-secondary uppercase tracking-wider">
          · last {data.windowDays} days
        </span>
      </div>

      {data.totalBundleOrders === 0 ? (
        <p className="text-sm admin-text-secondary">
          No bundle orders in this window yet — once customers start applying bundles, KPIs surface here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <Kpi label="Bundle orders" value={String(data.totalBundleOrders)} />
            <Kpi label="Revenue" value={zl(data.totalBundleRevenueGrosze)} />
            <Kpi label="Discounted (savings)" value={zl(data.totalSavingsGrosze)} tone="amber" />
            <Kpi
              label="Anchor conversion"
              value={`${anchorPct.toFixed(0)}%`}
              tone={anchorPct >= 55 ? "green" : anchorPct >= 35 ? "amber" : "red"}
              hint="Target ≥ 55% — Family Feast take rate among bundle orders."
            />
          </div>

          <div className="space-y-3">
            <section>
              <p className="text-[10px] uppercase tracking-wide admin-text-secondary mb-1.5">
                By bundle
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left admin-text-secondary">
                      <th className="py-1 pr-2">Bundle</th>
                      <th className="py-1 pr-2 text-right">Orders</th>
                      <th className="py-1 pr-2 text-right">Avg paid</th>
                      <th className="py-1 pr-2 text-right">Avg save</th>
                      <th className="py-1 pr-2 text-right">Eff. disc.</th>
                      <th className="py-1 pr-2 text-right">Avg mains</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byBundle.map((b) => (
                      <tr key={b.bundleId} className="border-t border-white/5">
                        <td className="py-1 pr-2 admin-text">{b.bundleName}</td>
                        <td className="py-1 pr-2 text-right admin-text">{b.count}</td>
                        <td className="py-1 pr-2 text-right admin-text">{zl(b.avgFinalGrosze)}</td>
                        <td className="py-1 pr-2 text-right text-italia-green">{zl(b.avgSavingsGrosze)}</td>
                        <td className="py-1 pr-2 text-right admin-text-secondary">
                          {(b.effectiveDiscount * 100).toFixed(0)}%
                        </td>
                        <td className="py-1 pr-2 text-right admin-text-secondary">
                          {b.avgMainsCount.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {data.byVariant.length > 0 && (
              <section>
                <p className="text-[10px] uppercase tracking-wide admin-text-secondary mb-1.5 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  A/B uplift
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left admin-text-secondary">
                        <th className="py-1 pr-2">Variant</th>
                        <th className="py-1 pr-2 text-right">Orders</th>
                        <th className="py-1 pr-2 text-right">Avg paid</th>
                        <th className="py-1 pr-2 text-right">Avg save</th>
                        <th className="py-1 pr-2 text-right">Total revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byVariant.map((v) => (
                        <tr key={v.variantId} className="border-t border-white/5">
                          <td className="py-1 pr-2 admin-text font-semibold">{v.variantId}</td>
                          <td className="py-1 pr-2 text-right admin-text">{v.count}</td>
                          <td className="py-1 pr-2 text-right admin-text">{zl(v.avgFinalGrosze)}</td>
                          <td className="py-1 pr-2 text-right text-italia-green">{zl(v.avgSavingsGrosze)}</td>
                          <td className="py-1 pr-2 text-right admin-text">{zl(v.totalRevenueGrosze)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {decoyRow && (
              <p className="text-[11px] admin-text-secondary">
                Decoy click-through: <span className={decoyPct <= 12 ? "text-italia-green" : "text-amber-300"}>{decoyPct.toFixed(0)}%</span>
                {" — "}
                target ≤ 12% (decoy should be dominated by the anchor, not chosen).
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-italia-green"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "red"
          ? "text-red-300"
          : "admin-text";
  return (
    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide admin-text-secondary">{label}</p>
      <p className={`font-heading font-bold text-base mt-0.5 ${toneClass}`}>{value}</p>
      {hint && <p className="text-[10px] admin-text-secondary mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}
