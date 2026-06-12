"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminV3BaseForPath, withAdminV3Base } from "@/lib/admin-base";

/**
 * WelcomeBrief — the wired Morning Brief (design direction #5). Full-bleed,
 * shell-less. The analytics half (yesterday, pacing, the constraint, leading
 * indicators, anomaly, locations) comes from /api/admin/welcome in one pass;
 * the decisions + alerts come from the boardroom approvals + notifications
 * routes. Every module is live data and degrades to nothing when its source
 * 403s or is empty — no placeholders, no fake numbers.
 */

interface Brief {
  yesterday: { revenue: number; prevRevenue: number; deltaPct: number | null; orders: number; avgOrderValue: number; profitMargin: number; perOrderProfitGrosze: number; topItems: { name: string; quantity: number }[] };
  today: { goalGrosze: number; forecastGrosze: number | null; pacePct: number | null };
  pacing: { mtdGrosze: number; monthGoalGrosze: number; projectionGrosze: number; aheadGrosze: number; pct: number; dayOfMonth: number; daysInMonth: number } | null;
  constraint: { peakHour: number; peakAvgPerHour: number; peakTotal: number } | null;
  leading: { repeatRatePct: number | null; newCustomersPerMonth: number | null; bookingsCount: number; bookingsAttendance: number; pulse: number | null; pulseDeltaPts: number | null; pulseResponses: number };
  anomaly: { city: string; avgTicketGrosze: number; chainAvgGrosze: number; deltaPct: number } | null;
  locations: { slug: string; city: string; revenue: number; orderCount: number; avgOrderValue: number | null }[];
}
interface Notif { id: string; type: string; title: string; message: string; createdAt: string; read: boolean }
interface Approval { meetingId: string; index: number; title: string; owner: string; rationale: string; proposedTool?: string }
interface AgentLite { id: string; name: string; initials: string }

const zl = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;
const zl2 = (g: number) => `${(g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const j = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

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

  const [brief, setBrief] = useState<Brief | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [decisions, setDecisions] = useState<Approval[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentLite>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, nRes, apRes, agRes] = await Promise.all([
        j(`/api/admin/welcome`),
        j(`/api/admin/notifications`),
        j(`/api/admin/ai/boardroom/approvals`),
        j(`/api/admin/ai/boardroom/agents`),
      ]);
      if (cancelled) return;
      setBrief(b as Brief | null);
      setNotifs((Array.isArray(nRes) ? nRes : []) as Notif[]);
      setDecisions((apRes?.approvals ?? []) as Approval[]);
      setAgents(new Map(((agRes?.agents ?? []) as AgentLite[]).map((a) => [a.id, { id: a.id, name: a.name, initials: a.initials }])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const now = useMemo(() => new Date(), []);
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const y = brief?.yesterday;
  const pacing = brief?.pacing ?? null;
  const goal = brief?.today.goalGrosze ?? 0;
  const forecast = brief?.today.forecastGrosze ?? null;
  const unread = notifs.filter((n) => !n.read);

  const tldr = useMemo(() => {
    if (!brief) return null;
    const out: React.ReactNode[] = [];
    if (y && y.revenue > 0) out.push(<span key="r">Yesterday closed at <b>{zl(y.revenue)}</b>{y.deltaPct != null ? ` (${y.deltaPct >= 0 ? "+" : ""}${y.deltaPct}%)` : ""}.</span>);
    if (pacing) out.push(<span key="p"> On pace for <b>{zl(pacing.projectionGrosze)}</b> this month.</span>);
    const d = decisions.length, u = unread.length;
    out.push(d || u ? <span key="n"> {d ? `${d} decision${d > 1 ? "s" : ""}` : ""}{d && u ? " and " : ""}{u ? `${u} alert${u > 1 ? "s" : ""}` : ""} need you.</span> : <span key="c"> Nothing needs you — a clean start.</span>);
    return out;
  }, [brief, y, pacing, decisions.length, unread.length]);

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
          <div className="v wb-num">{loading ? skel("60%", 48) : zl(y?.revenue ?? 0)}</div>
          {!loading && y?.deltaPct != null && (
            <div className="cap wb-num"><span className={y.deltaPct >= 0 ? "wb-pos" : "wb-neg"}>{y.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(y.deltaPct)}%</span> vs the prior day</div>
          )}
          {!loading && pacing && (
            <>
              <div className="track" style={{ marginTop: 16 }}><i style={{ width: `${Math.min(100, pacing.pct)}%` }} /></div>
              <div className="cap wb-num">
                Month <b style={{ color: "var(--fg)" }}>{zl(pacing.mtdGrosze)}</b> of {zl(pacing.monthGoalGrosze)} · {pacing.pct}% · day {pacing.dayOfMonth}/{pacing.daysInMonth}
              </div>
              <div className="eng wb-num">On pace for <b>{zl(pacing.projectionGrosze)}</b> · <span className={pacing.aheadGrosze >= 0 ? "wb-pos" : "wb-neg"}>{pacing.aheadGrosze >= 0 ? "+" : "−"}{zl(Math.abs(pacing.aheadGrosze))}</span> {pacing.aheadGrosze >= 0 ? "ahead of" : "behind"} goal</div>
            </>
          )}
          {!loading && !pacing && goal > 0 && (
            <div className="eng wb-num" style={{ marginTop: 14 }}>Today’s goal <b style={{ color: "var(--fg)" }}>{zl(goal)}</b>{forecast != null ? <> — forecast <b>{zl(forecast)}</b></> : null}</div>
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
            const o = agents.get(a.owner);
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

        {/* THE CONSTRAINT */}
        {!loading && brief?.constraint && (
          <div className="wb-group">
            <div className="wb-glabel">The constraint <span className="n">· your throughput ceiling</span></div>
            <div className="wb-constraint">
              <div className="h">Busiest stretch · {hh(brief.constraint.peakHour)}–{hh((brief.constraint.peakHour + 1) % 24)}</div>
              <div className="b">Across the last 30 days that hour ran <b>~{brief.constraint.peakAvgPerHour} orders/hr</b> on average — your peak load and the ceiling to watch when you add covers or a delivery push.</div>
            </div>
          </div>
        )}

        {/* LEADING INDICATORS */}
        {!loading && brief?.leading && (brief.leading.repeatRatePct != null || brief.leading.pulse != null || brief.leading.bookingsCount > 0) && (
          <div className="wb-group">
            <div className="wb-glabel">Leading indicators <span className="n">· next month, today</span></div>
            <div className="wb-grid4">
              <div className="wb-tcell"><div className="k">Repeat rate</div><div className="v wb-num">{brief.leading.repeatRatePct != null ? `${brief.leading.repeatRatePct}%` : "—"}</div><div className="d">30-day</div></div>
              <div className="wb-tcell"><div className="k">New cust / mo</div><div className="v wb-num">{brief.leading.newCustomersPerMonth ?? "—"}</div></div>
              <div className="wb-tcell"><div className="k">Bookings · 14d</div><div className="v wb-num">{brief.leading.bookingsCount}</div><div className="d">{brief.leading.bookingsAttendance > 0 ? `${brief.leading.bookingsAttendance} pax` : "events"}</div></div>
              <div className="wb-tcell"><div className="k">Pulse (NPS)</div><div className="v wb-num">{brief.leading.pulse != null ? brief.leading.pulse : "—"}</div>{brief.leading.pulseDeltaPts != null ? <div className={`d ${brief.leading.pulseDeltaPts >= 0 ? "up" : "down"}`}>{brief.leading.pulseDeltaPts >= 0 ? "▲" : "▼"} {Math.abs(brief.leading.pulseDeltaPts)} pts</div> : <div className="d">{brief.leading.pulseResponses} answers</div>}</div>
            </div>
          </div>
        )}

        {/* ANOMALY */}
        {!loading && brief?.anomaly && (
          <div className="wb-group">
            <div className="wb-glabel">Worth copying</div>
            <div className="wb-anom"><b>{brief.anomaly.city}</b>’s average ticket — <b>{zl2(brief.anomaly.avgTicketGrosze)}</b> — runs <b>{brief.anomaly.deltaPct}% above</b> the chain ({zl2(brief.anomaly.chainAvgGrosze)}). Whatever’s working there is worth rolling out everywhere.</div>
          </div>
        )}

        {/* LOCATIONS */}
        {!loading && brief && brief.locations.length > 0 && (
          <div className="wb-group">
            <div className="wb-glabel">By location <span className="n">· yesterday</span></div>
            {brief.locations.map((l) => (
              <div className="wb-loc" key={l.slug}>
                <div><div className="nm">{l.city}</div><div className="sub">{l.orderCount} orders{l.avgOrderValue ? ` · ${zl2(l.avgOrderValue)} avg` : ""}</div></div>
                <div className="val wb-num">{zl(l.revenue)}</div>
              </div>
            ))}
          </div>
        )}

        {/* TODAY AHEAD */}
        {!loading && y && (goal > 0 || forecast != null) && (
          <div className="wb-group">
            <div className="wb-glabel">Today, ahead</div>
            <div className="wb-today">
              <div className="wb-tcell"><div className="k">Revenue goal</div><div className="v wb-num">{goal > 0 ? zl(goal) : "—"}</div></div>
              <div className="wb-tcell"><div className="k">Forecast</div><div className="v wb-num">{forecast != null ? zl(forecast) : "—"}</div><div className="d">{forecast != null && brief?.today.pacePct != null ? `${brief.today.pacePct}% of goal` : "labour model"}</div></div>
              <div className="wb-tcell"><div className="k">Profit / order</div><div className="v wb-num">{zl2(y.perOrderProfitGrosze)}</div><div className="d">{Math.round(y.profitMargin)}% margin</div></div>
            </div>
          </div>
        )}

        {/* YESTERDAY RECAP (demoted) */}
        {!loading && y && (
          <div className="wb-group">
            <div className="wb-glabel">Yesterday · for the record</div>
            <div className="wb-recap">
              <span className="it"><b>{y.orders}</b> orders</span>
              <span className="it">avg <b>{zl2(y.avgOrderValue)}</b></span>
              <span className="it">margin <b>{Math.round(y.profitMargin)}%</b></span>
              {y.topItems.map((t) => (<span className="it" key={t.name}>{t.name} <b>×{t.quantity}</b></span>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
