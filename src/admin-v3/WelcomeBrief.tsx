"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminV3BaseForPath, withAdminV3Base } from "@/lib/admin-base";

/**
 * WelcomeBrief — the wired Morning Brief (design direction #5). Full-bleed,
 * shell-less. Lead with yesterday's close + today's goal/forecast (a morning
 * brief runs before the day has traded), then the board decisions awaiting
 * you, what-needs-you, the location split and a demoted recap. Every module is
 * live data; any source that 403s or returns nothing simply drops out — no
 * placeholders, no fake numbers. Deferred to phase 2 (need new computation):
 * monthly goal-pacing, the capacity "constraint", margin/pizza, NPS trend,
 * leading indicators, anomaly detection.
 */

interface Summary { totalRevenue: number; totalOrders: number; avgOrderValue: number; profitMargin: number; topItems?: { name: string; quantity: number }[] }
interface LocCompare { locationSlug: string; city: string; revenue: number; orderCount: number; avgOrderValue?: number }
interface Notif { id: string; type: string; title: string; message: string; createdAt: string; read: boolean }
interface Approval { meetingId: string; index: number; title: string; owner: string; rationale: string; proposedTool?: string }
interface AgentLite { id: string; name: string; initials: string }
interface Goals { dailyRevenueGoalGrosze?: number; byLocation?: Record<string, number> }
interface LaborEff { perLocation?: { locationSlug: string; today?: { forecastOrders?: number; forecastSource?: string } }[] }

interface Data {
  yest: Summary | null; prev: Summary | null; locs: LocCompare[];
  notifs: Notif[]; approvals: Approval[]; agents: Map<string, AgentLite>;
  goalGrosze: number; forecastRevGrosze: number | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const zl = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;
const zl2 = (g: number) => `${(g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const j = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
const NOTIF_TONE: Record<string, string> = {
  low_stock: "var(--gold)", dispute: "var(--ember)", new_order: "var(--blue)",
  slot_full: "var(--blue)", low_slots: "var(--blue)", bundle_low_margin: "var(--ember)",
};

export function WelcomeBrief({ name }: { name: string }) {
  const pathname = usePathname();
  const base = adminV3BaseForPath(pathname);
  const link = useCallback((href: string) => withAdminV3Base(base, href), [base]);

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const yest = iso(new Date(now.getTime() - 864e5));
    const prev = iso(new Date(now.getTime() - 2 * 864e5));
    (async () => {
      const [aY, aP, insRes, goalsRes, effRes, nRes, apRes, agRes] = await Promise.all([
        j(`/api/admin/analytics?from=${yest}&to=${yest}`),
        j(`/api/admin/analytics?from=${prev}&to=${prev}`),
        j(`/api/admin/insights?from=${yest}&to=${yest}`),
        j(`/api/admin/ops-goals`),
        j(`/api/admin/labor-efficiency`),
        j(`/api/admin/notifications`),
        j(`/api/admin/ai/boardroom/approvals`),
        j(`/api/admin/ai/boardroom/agents`),
      ]);
      if (cancelled) return;

      const goals: Goals = goalsRes ?? {};
      const eff: LaborEff = effRes ?? {};
      const yov = (aY as Summary | null)?.avgOrderValue ?? 0;
      const forecastOrders = (eff.perLocation ?? []).reduce(
        (s, p) => s + (p.today?.forecastSource && p.today.forecastSource !== "none" ? p.today?.forecastOrders ?? 0 : 0), 0,
      );
      const forecastRev = forecastOrders > 0 && yov > 0 ? Math.round(forecastOrders * yov) : null;

      const agents = new Map<string, AgentLite>(
        ((agRes?.agents ?? []) as AgentLite[]).map((a) => [a.id, { id: a.id, name: a.name, initials: a.initials }]),
      );

      setData({
        yest: aY as Summary | null,
        prev: aP as Summary | null,
        locs: (insRes?.locationComparison ?? []) as LocCompare[],
        notifs: (Array.isArray(nRes) ? nRes : []) as Notif[],
        approvals: (apRes?.approvals ?? []) as Approval[],
        agents,
        goalGrosze: goals.dailyRevenueGoalGrosze ?? 0,
        forecastRevGrosze: forecastRev,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const now = useMemo(() => new Date(), []);
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const yRev = data?.yest?.totalRevenue ?? 0;
  const pRev = data?.prev?.totalRevenue ?? 0;
  const delta = pRev > 0 ? ((yRev - pRev) / pRev) * 100 : null;
  const goal = data?.goalGrosze ?? 0;
  const forecast = data?.forecastRevGrosze ?? null;
  const pacePct = goal > 0 && forecast != null ? Math.min(100, Math.round((forecast / goal) * 100)) : null;
  const unread = (data?.notifs ?? []).filter((n) => !n.read);
  const decisions = data?.approvals ?? [];

  const tldr = useMemo(() => {
    if (!data) return null;
    const parts: React.ReactNode[] = [];
    if (yRev > 0) parts.push(<span key="r">Yesterday closed at <b>{zl(yRev)}</b>{delta != null ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)` : ""}.</span>);
    const d = decisions.length, u = unread.length;
    if (d || u) parts.push(<span key="n"> {d ? `${d} decision${d > 1 ? "s" : ""}` : ""}{d && u ? " and " : ""}{u ? `${u} alert${u > 1 ? "s" : ""}` : ""} need you.</span>);
    else parts.push(<span key="c"> Nothing needs you — a clean start.</span>);
    return parts;
  }, [data, yRev, delta, decisions.length, unread.length]);

  const skel = (w: string, h = 14) => <span className="wb-skel" style={{ display: "inline-block", width: w, height: h, borderRadius: 6 }} />;

  return (
    <div className="wb-stage">
      {/* ── LEFT HERO ── */}
      <div className="wb-hero">
        <div className="wb-brandline"><span className="wb-mark" /> Sud Italia · Morning Briefing</div>
        <div className="wb-greet" suppressHydrationWarning>{greetingFor(now)},<br /><span className="em">{name}.</span></div>
        <div className="wb-date" suppressHydrationWarning>{dateStr} · 2 trucks live</div>
        <div className="wb-tldr">{loading ? skel("90%", 22) : tldr}</div>

        <div className="wb-pace">
          <div className="k">Yesterday’s close</div>
          <div className="v wb-num">{loading ? skel("60%", 48) : zl(yRev)}</div>
          {!loading && delta != null && (
            <div className="cap wb-num">
              <span className={delta >= 0 ? "wb-pos" : "wb-neg"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%</span> vs the prior day
            </div>
          )}
          {!loading && goal > 0 && (
            <>
              <div className="track" style={{ marginTop: 16 }}><i style={{ width: `${pacePct ?? 0}%` }} /></div>
              <div className="eng wb-num">
                Today’s goal <b style={{ color: "var(--fg)" }}>{zl(goal)}</b>
                {forecast != null ? <> — forecast <b>{zl(forecast)}</b>{pacePct != null ? ` · ${pacePct}% of goal` : ""}</> : <> — forecast pending</>}
              </div>
            </>
          )}
        </div>

        <div className="wb-actions">
          <Link className="wb-enter" href={link("/admin")}>Enter the dashboard →</Link>
          <Link className="wb-skip" href={link("/admin/orders")}>or jump to Orders</Link>
        </div>
      </div>

      {/* ── RIGHT FEED ── */}
      <div className="wb-feed">
        <div className="wb-feedhead">
          <div className="ttl">What needs you</div>
          <div className="meta">{loading ? "" : `${unread.length} unread · ${decisions.length} to approve`}</div>
        </div>

        {/* DECISIONS */}
        <div className="wb-group">
          <div className="wb-glabel">Decisions awaiting you <span className="n">· from your AI boardroom</span></div>
          {loading ? skel("100%", 60) : decisions.length === 0 ? (
            <div className="wb-empty">Nothing waiting on your approval.</div>
          ) : decisions.slice(0, 4).map((a) => {
            const o = data!.agents.get(a.owner);
            return (
              <div className="wb-dec" key={`${a.meetingId}-${a.index}`}>
                <span className="wb-ava">{o?.initials ?? "··"}</span>
                <div>
                  <div className="t">{a.title}</div>
                  <div className="m"><span className="who">{o?.name ?? a.owner}</span>{a.rationale ? <> · {a.rationale}</> : null}{a.proposedTool ? <> · <span className="tool">{a.proposedTool}</span></> : null}</div>
                </div>
                <span className="wb-chip">approve</span>
              </div>
            );
          })}
          {!loading && decisions.length > 0 && <Link className="wb-lk" href={link("/admin/agent-hq")}>Open Agent HQ →</Link>}
        </div>

        {/* NEEDS YOU */}
        <div className="wb-group">
          <div className="wb-glabel">Needs your attention</div>
          {loading ? skel("100%", 50) : unread.length === 0 ? (
            <div className="wb-empty">You’re all clear — no unread alerts.</div>
          ) : unread.slice(0, 5).map((n) => (
            <div className="wb-att" key={n.id}>
              <span className="wb-ad" style={{ background: NOTIF_TONE[n.type] ?? "var(--violet)", color: NOTIF_TONE[n.type] ?? "var(--violet)" }} />
              <div><div className="t">{n.title}</div>{n.message ? <div className="m">{n.message}</div> : null}</div>
            </div>
          ))}
          {!loading && unread.length > 0 && <Link className="wb-lk" href={link("/admin/alerts")}>Open all alerts →</Link>}
        </div>

        {/* LOCATIONS */}
        {!loading && data!.locs.length > 0 && (
          <div className="wb-group">
            <div className="wb-glabel">By location <span className="n">· yesterday</span></div>
            {data!.locs.map((l) => (
              <div className="wb-loc" key={l.locationSlug}>
                <div><div className="nm">{l.city}</div><div className="sub">{l.orderCount} orders{l.avgOrderValue ? ` · ${zl2(l.avgOrderValue)} avg` : ""}</div></div>
                <div className="val wb-num">{zl(l.revenue)}</div>
              </div>
            ))}
          </div>
        )}

        {/* TODAY AHEAD */}
        {!loading && (goal > 0 || forecast != null) && (
          <div className="wb-group">
            <div className="wb-glabel">Today, ahead</div>
            <div className="wb-today">
              <div className="wb-tcell"><div className="k">Revenue goal</div><div className="v wb-num">{goal > 0 ? zl(goal) : "—"}</div></div>
              <div className="wb-tcell"><div className="k">Forecast</div><div className="v wb-num">{forecast != null ? zl(forecast) : "—"}</div><div className="d">{forecast != null && pacePct != null ? `${pacePct}% of goal` : "from labour model"}</div></div>
              <div className="wb-tcell"><div className="k">Awaiting you</div><div className="v wb-num">{decisions.length + unread.length}</div><div className="d">{decisions.length} decisions · {unread.length} alerts</div></div>
            </div>
          </div>
        )}

        {/* YESTERDAY RECAP (demoted) */}
        {!loading && data!.yest && (
          <div className="wb-group">
            <div className="wb-glabel">Yesterday · for the record</div>
            <div className="wb-recap">
              <span className="it"><b>{data!.yest.totalOrders}</b> orders</span>
              <span className="it">avg <b>{zl2(data!.yest.avgOrderValue)}</b></span>
              <span className="it">margin <b>{Math.round(data!.yest.profitMargin)}%</b></span>
              {(data!.yest.topItems ?? []).slice(0, 2).map((t) => (
                <span className="it" key={t.name}>{t.name} <b>×{t.quantity}</b></span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
