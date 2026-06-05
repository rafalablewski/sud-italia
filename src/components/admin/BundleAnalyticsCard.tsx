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
    thumbsUp: number;
    thumbsDown: number;
    thumbsDownRate: number;
    refundCount: number;
    refundRate: number;
    topRefundReason: string | null;
  }[];
  byVariant: {
    variantId: string;
    label?: string;
    isControl: boolean;
    count: number;
    impressions: number;
    conversionRate: number;
    avgFinalGrosze: number;
    avgSavingsGrosze: number;
    totalRevenueGrosze: number;
    avgContributionGrosze: number;
    totalContributionGrosze: number;
    verdict: {
      metric: "conversion" | "aov" | "contribution";
      relativeLift: number;
      pValue: number;
      significant: boolean;
      decision: "collect_more" | "winner" | "loser" | "no_difference";
      reason: string;
    } | null;
  }[];
  experiment?: {
    id: string;
    name: string;
    status: "draft" | "running" | "stopped" | null;
    primaryMetric: "conversion" | "aov" | "contribution";
    controlVariantId: string;
    startedAt: string | null;
    stoppedAt: string | null;
  } | null;
  funnel?: {
    impressions: number;
    composerOpens: number;
    composerAbandons: number;
    applies: number;
    composerOpenRate: number;
    applyFromComposerRate: number;
  };
  byCohort?: { cohort: "new" | "repeat" | "unknown"; count: number; avgFinalGrosze: number }[];
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
    return <div className="v2-card p-4 text-sm admin-text-secondary">Loading bundle analytics…</div>;
  }
  if (err || !data) {
    return (
      <div className="v2-card p-4 text-sm text-[var(--danger)] flex items-center gap-2">
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
    <div className="v2-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[var(--warning)]" />
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
                      <th className="py-1 pr-2 text-right">Value</th>
                      <th className="py-1 pr-2 text-right">Refunds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byBundle.map((b) => (
                      <tr key={b.bundleId} className="border-t border-[var(--border)]">
                        <td className="py-1 pr-2 admin-text">{b.bundleName}</td>
                        <td className="py-1 pr-2 text-right admin-text">{b.count}</td>
                        <td className="py-1 pr-2 text-right admin-text">{zl(b.avgFinalGrosze)}</td>
                        <td className="py-1 pr-2 text-right text-[var(--success)]">{zl(b.avgSavingsGrosze)}</td>
                        <td className="py-1 pr-2 text-right admin-text-secondary">
                          {(b.effectiveDiscount * 100).toFixed(0)}%
                        </td>
                        <td className="py-1 pr-2 text-right admin-text-secondary">
                          {b.avgMainsCount.toFixed(1)}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          <BundleSentiment up={b.thumbsUp} down={b.thumbsDown} rate={b.thumbsDownRate} />
                        </td>
                        <td className="py-1 pr-2 text-right">
                          <BundleRefunds count={b.refundCount} rate={b.refundRate} reason={b.topRefundReason} />
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
                  A/B significance
                  {data.experiment && (
                    <span className="normal-case tracking-normal admin-text-secondary">
                      · {data.experiment.name}
                      {data.experiment.status ? ` (${data.experiment.status})` : ""} · decided on{" "}
                      {metricLabel(data.experiment.primaryMetric)}
                    </span>
                  )}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left admin-text-secondary">
                        <th className="py-1 pr-2">Variant</th>
                        <th className="py-1 pr-2 text-right">Orders</th>
                        <th className="py-1 pr-2 text-right">Conv.</th>
                        <th className="py-1 pr-2 text-right">Avg paid</th>
                        <th className="py-1 pr-2 text-right">Avg contrib.</th>
                        <th className="py-1 pr-2 text-right">Lift</th>
                        <th className="py-1 pr-2">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byVariant.map((v) => (
                        <tr key={v.variantId} className="border-t border-[var(--border)]">
                          <td className="py-1 pr-2 admin-text font-semibold">
                            {v.label ?? v.variantId}
                            {v.isControl && (
                              <span className="ml-1 text-[9px] uppercase tracking-wide admin-text-secondary">
                                control
                              </span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-right admin-text">{v.count}</td>
                          <td className="py-1 pr-2 text-right admin-text-secondary">
                            {v.impressions > 0 ? `${(v.conversionRate * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-1 pr-2 text-right admin-text">{zl(v.avgFinalGrosze)}</td>
                          <td className="py-1 pr-2 text-right admin-text">
                            {v.avgContributionGrosze > 0 ? zl(v.avgContributionGrosze) : "—"}
                          </td>
                          <td className="py-1 pr-2 text-right admin-text">
                            {v.verdict ? (
                              <span className={liftClass(v.verdict.relativeLift)}>
                                {fmtLift(v.verdict.relativeLift)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            {v.verdict ? <VerdictBadge decision={v.verdict.decision} /> : <span className="admin-text-secondary">baseline</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(() => {
                  const decisive = data.byVariant.find((v) => v.verdict && (v.verdict.decision === "winner" || v.verdict.decision === "loser"));
                  const pending = data.byVariant.find((v) => v.verdict?.decision === "collect_more");
                  const note = decisive?.verdict?.reason ?? pending?.verdict?.reason;
                  return note ? (
                    <p className="text-[11px] admin-text-secondary mt-1.5">{note}</p>
                  ) : null;
                })()}
              </section>
            )}

            {decoyRow && (
              <p className="text-[11px] admin-text-secondary">
                Decoy click-through: <span className={decoyPct <= 12 ? "text-[var(--success)]" : "text-[var(--warning)]"}>{decoyPct.toFixed(0)}%</span>
                {" — "}
                target ≤ 12% (decoy should be dominated by the anchor, not chosen).
              </p>
            )}

            {data.funnel && data.funnel.impressions > 0 && (
              <section>
                <p className="text-[10px] uppercase tracking-wide admin-text-secondary mb-1.5">
                  Conversion funnel
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left admin-text-secondary">
                        <th className="py-1 pr-2">Stage</th>
                        <th className="py-1 pr-2 text-right">Count</th>
                        <th className="py-1 pr-2 text-right">vs prior</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[var(--border)]">
                        <td className="py-1 pr-2 admin-text">Impressions</td>
                        <td className="py-1 pr-2 text-right admin-text">{data.funnel.impressions}</td>
                        <td className="py-1 pr-2 text-right admin-text-secondary">—</td>
                      </tr>
                      <tr className="border-t border-[var(--border)]">
                        <td className="py-1 pr-2 admin-text">Composer opens</td>
                        <td className="py-1 pr-2 text-right admin-text">{data.funnel.composerOpens}</td>
                        <td className="py-1 pr-2 text-right admin-text-secondary">
                          {(data.funnel.composerOpenRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                      <tr className="border-t border-[var(--border)]">
                        <td className="py-1 pr-2 admin-text">Applied</td>
                        <td className="py-1 pr-2 text-right admin-text">{data.funnel.applies}</td>
                        <td className="py-1 pr-2 text-right text-[var(--success)]">
                          {(data.funnel.applyFromComposerRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                      <tr className="border-t border-[var(--border)] admin-text-secondary">
                        <td className="py-1 pr-2">Composer abandons</td>
                        <td className="py-1 pr-2 text-right">{data.funnel.composerAbandons}</td>
                        <td className="py-1 pr-2 text-right">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {data.byCohort && data.byCohort.length > 0 && (
              <section>
                <p className="text-[10px] uppercase tracking-wide admin-text-secondary mb-1.5">
                  New vs repeat customer split
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left admin-text-secondary">
                        <th className="py-1 pr-2">Cohort</th>
                        <th className="py-1 pr-2 text-right">Orders</th>
                        <th className="py-1 pr-2 text-right">Avg paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCohort.map((c) => (
                        <tr key={c.cohort} className="border-t border-[var(--border)]">
                          <td className="py-1 pr-2 admin-text capitalize">{c.cohort}</td>
                          <td className="py-1 pr-2 text-right admin-text">{c.count}</td>
                          <td className="py-1 pr-2 text-right admin-text">{zl(c.avgFinalGrosze)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] admin-text-secondary mt-1">
                  Healthy bundle-acquisition: ≥25% of bundle orders should be from new customers.
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Voice-of-customer sentiment for a bundle. Shows the thumbs split and
 *  flags a high disappointment rate (≥20% down on ≥5 ratings) in amber so
 *  a high-converting-but-disliked bundle is visible (audit elite-qsr §2). */
function BundleSentiment({ up, down, rate }: { up: number; down: number; rate: number }) {
  const total = up + down;
  if (total === 0) return <span className="admin-text-secondary">—</span>;
  const flag = total >= 5 && rate >= 0.2;
  return (
    <span className={flag ? "text-[var(--warning)] font-semibold" : "admin-text-secondary"}>
      👍 {up} · 👎 {down}
      {flag ? ` (${(rate * 100).toFixed(0)}% ↓)` : ""}
    </span>
  );
}

/** Refund rate for a bundle (audit elite-qsr §3). Amber-flags ≥8% on ≥5
 *  orders — a bundle refunding materially more than à la carte usually
 *  means it forces items the customer didn't want. */
function BundleRefunds({ count, rate, reason }: { count: number; rate: number; reason: string | null }) {
  if (count === 0) return <span className="admin-text-secondary">—</span>;
  const flag = count >= 5 && rate >= 0.08;
  return (
    <span
      className={flag ? "text-[var(--warning)] font-semibold" : "admin-text-secondary"}
      title={reason ? `Top reason: ${reason}` : undefined}
    >
      {count} ({(rate * 100).toFixed(0)}%)
    </span>
  );
}

function metricLabel(m: "conversion" | "aov" | "contribution"): string {
  return m === "conversion" ? "conversion rate" : m === "aov" ? "avg order value" : "contribution";
}

function fmtLift(rel: number): string {
  if (!Number.isFinite(rel)) return "—";
  const pct = rel * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function liftClass(rel: number): string {
  if (!Number.isFinite(rel) || rel === 0) return "admin-text-secondary";
  return rel > 0 ? "text-[var(--success)]" : "text-[var(--danger)]";
}

function VerdictBadge({ decision }: { decision: "collect_more" | "winner" | "loser" | "no_difference" }) {
  const map = {
    winner: { label: "Winner", cls: "bg-[var(--success)]/15 text-[var(--success)]" },
    loser: { label: "Worse", cls: "bg-[var(--danger)]/15 text-[var(--danger)]" },
    collect_more: { label: "Collecting", cls: "bg-[var(--warning)]/15 text-[var(--warning)]" },
    no_difference: { label: "No diff.", cls: "admin-text-secondary bg-[var(--surface-2)]" },
  } as const;
  const { label, cls } = map[decision];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
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
      ? "text-[var(--success)]"
      : tone === "amber"
        ? "text-[var(--warning)]"
        : tone === "red"
          ? "text-[var(--danger)]"
          : "admin-text";
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide admin-text-secondary">{label}</p>
      <p className={`font-heading font-bold text-base mt-0.5 ${toneClass}`}>{value}</p>
      {hint && <p className="text-[10px] admin-text-secondary mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}
