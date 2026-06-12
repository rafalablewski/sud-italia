"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminV3BaseForPath, withAdminV3Base } from "@/lib/admin-base";
import { formatPricePLN, formatPricePLNCompact } from "@/lib/utils";
import { Monogram } from "@/admin-v3/agent-hq/shared";
import { InfoButton } from "@/admin-v3/ui/Explainer";

/**
 * WelcomeBrief — the wired Morning Brief (design direction #5), built on the
 * shared av3 design system: av3 tokens (no parallel palette), the shared
 * Monogram avatar, the shared PLN formatters, and the five-section InfoButton
 * (Rule #12) on every novel metric. The analytics half comes from
 * /api/admin/welcome in one pass; decisions + alerts from the boardroom
 * approvals + notifications routes. Location count + open status are real,
 * passed from the server. Every module degrades to nothing when its source
 * 403s or is empty — no placeholders, no fake numbers.
 */

interface Brief {
  yesterday: { revenue: number; prevRevenue: number; deltaPct: number | null; orders: number; avgOrderValue: number; profitMargin: number; perOrderProfitGrosze: number; topItems: { name: string; quantity: number }[] };
  today: { goalGrosze: number; forecastGrosze: number | null; pacePct: number | null };
  pacing: { mtdGrosze: number; monthGoalGrosze: number; projectionGrosze: number; aheadGrosze: number; pct: number; dayOfMonth: number; daysInMonth: number } | null;
  constraint: { peakHour: number; peakAvgPerHour: number; peakTotal: number } | null;
  leading: { repeatRatePct: number | null; newCustomersPerMonth: number | null; bookingsCount: number; bookingsAttendance: number; pulse: number | null; pulseDeltaPts: number | null; pulseResponses: number };
  anomaly: { city: string; avgTicketGrosze: number; chainAvgGrosze: number; deltaPct: number } | null;
  ai: { todayGrosze: number; yesterdayGrosze: number; budgetGrosze: number } | null;
  locations: { slug: string; city: string; revenue: number; orderCount: number; avgOrderValue: number | null }[];
}
interface Notif { id: string; type: string; title: string; message: string; createdAt: string; read: boolean }
interface Approval { meetingId: string; index: number; title: string; owner: string; rationale: string; proposedTool?: string }
interface AgentLite { id: string; name: string; initials: string; accentVar: string }

const compact = formatPricePLNCompact;
const exact = formatPricePLN;
const j = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
// Notification dot tone → shared av3 semantic / chart tokens (no hardcoded hex).
const NOTIF_TONE: Record<string, string> = {
  low_stock: "var(--av3-warn)", dispute: "var(--av3-bad)", new_order: "var(--av3-c3)",
  slot_full: "var(--av3-c3)", low_slots: "var(--av3-c3)", bundle_low_margin: "var(--av3-bad)",
};
const NOTIF_DEFAULT = "var(--av3-c6)";

export function WelcomeBrief({ name, locationCount, openNow }: { name: string; locationCount: number; openNow: number }) {
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
      setAgents(new Map(((agRes?.agents ?? []) as AgentLite[]).map((a) => [a.id, { id: a.id, name: a.name, initials: a.initials, accentVar: a.accentVar }])));
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
    if (y && y.revenue > 0) out.push(<span key="r">Yesterday closed at <b>{compact(y.revenue)}</b>{y.deltaPct != null ? ` (${y.deltaPct >= 0 ? "+" : ""}${y.deltaPct}%)` : ""}.</span>);
    if (pacing) out.push(<span key="p"> On pace for <b>{compact(pacing.projectionGrosze)}</b> this month.</span>);
    const d = decisions.length, u = unread.length;
    out.push(d || u ? <span key="n"> {d ? `${d} decision${d > 1 ? "s" : ""}` : ""}{d && u ? " and " : ""}{u ? `${u} alert${u > 1 ? "s" : ""}` : ""} need you.</span> : <span key="c"> Nothing needs you — a clean start.</span>);
    return out;
  }, [brief, y, pacing, decisions.length, unread.length]);

  const skel = (w: string, h = 14) => <span className="wb-skel" style={{ display: "inline-block", width: w, height: h }} />;

  return (
    <div className="wb-stage">
      {/* ── LEFT HERO ── */}
      <div className="wb-hero">
        <div className="wb-brandline"><span className="wb-mark" /> Sud Italia · Morning Briefing</div>
        <div className="wb-greet" suppressHydrationWarning>{greetingFor(now)},<br /><span className="em">{name}.</span></div>
        <div className="wb-date" suppressHydrationWarning>{dateStr} · {openNow}/{locationCount} trucks open</div>
        <div className="wb-tldr">{loading ? skel("90%", 22) : tldr}</div>

        <div className="wb-pace">
          <div className="k">Yesterday’s close</div>
          <div className="v wb-num">{loading ? skel("60%", 48) : compact(y?.revenue ?? 0)}</div>
          {!loading && y?.deltaPct != null && (
            <div className="cap wb-num"><span className={y.deltaPct >= 0 ? "wb-pos" : "wb-neg"}>{y.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(y.deltaPct)}%</span> vs the prior day</div>
          )}
          {!loading && pacing && (
            <>
              <div className="track"><i style={{ width: `${Math.min(100, pacing.pct)}%` }} /></div>
              <div className="cap wb-num" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Month <b>{compact(pacing.mtdGrosze)}</b> of {compact(pacing.monthGoalGrosze)} · {pacing.pct}% · day {pacing.dayOfMonth}/{pacing.daysInMonth}</span>
                <InfoButton title="Monthly pacing" {...PACING_EXPLAINER} />
              </div>
              <div className="eng wb-num">On pace for <b>{compact(pacing.projectionGrosze)}</b> · <span className={pacing.aheadGrosze >= 0 ? "wb-pos" : "wb-neg"}>{pacing.aheadGrosze >= 0 ? "+" : "−"}{compact(Math.abs(pacing.aheadGrosze))}</span> {pacing.aheadGrosze >= 0 ? "ahead of" : "behind"} goal</div>
            </>
          )}
          {!loading && !pacing && goal > 0 && (
            <div className="eng wb-num" style={{ marginTop: 14 }}>Today’s goal <b>{compact(goal)}</b>{forecast != null ? <> — forecast <b>{compact(forecast)}</b></> : null}</div>
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
                <Monogram initials={o?.initials ?? "··"} accentVar={o?.accentVar ?? "--av3-subtle"} size={32} />
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
              <span className="wb-ad" style={{ background: NOTIF_TONE[n.type] ?? NOTIF_DEFAULT, color: NOTIF_TONE[n.type] ?? NOTIF_DEFAULT }} />
              <div><div className="t">{n.title}</div>{n.message ? <div className="m">{n.message}</div> : null}</div>
            </div>
          ))}
          {!loading && unread.length > 0 && <Link className="wb-lk" href={link("/admin/alerts")}>Open all alerts →</Link>}
        </div>

        {/* THE CONSTRAINT */}
        {!loading && brief?.constraint && (
          <div className="wb-group">
            <div className="wb-glabel">The constraint <span className="n">· your throughput ceiling</span> <InfoButton title="The constraint — busiest hour" {...CONSTRAINT_EXPLAINER} /></div>
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
              <div className="wb-tcell"><div className="k">Repeat rate <InfoButton title="Repeat rate (30-day)" {...REPEAT_EXPLAINER} /></div><div className="v wb-num">{brief.leading.repeatRatePct != null ? `${brief.leading.repeatRatePct}%` : "—"}</div><div className="d">30-day</div></div>
              <div className="wb-tcell"><div className="k">New cust / mo</div><div className="v wb-num">{brief.leading.newCustomersPerMonth ?? "—"}</div></div>
              <div className="wb-tcell"><div className="k">Bookings · 14d</div><div className="v wb-num">{brief.leading.bookingsCount}</div><div className="d">{brief.leading.bookingsAttendance > 0 ? `${brief.leading.bookingsAttendance} pax` : "events"}</div></div>
              <div className="wb-tcell"><div className="k">Pulse (NPS) <InfoButton title="Pulse score (NPS-style)" {...PULSE_EXPLAINER} /></div><div className="v wb-num">{brief.leading.pulse != null ? brief.leading.pulse : "—"}</div>{brief.leading.pulseDeltaPts != null ? <div className={`d ${brief.leading.pulseDeltaPts >= 0 ? "up" : "down"}`}>{brief.leading.pulseDeltaPts >= 0 ? "▲" : "▼"} {Math.abs(brief.leading.pulseDeltaPts)} pts</div> : <div className="d">{brief.leading.pulseResponses} answers</div>}</div>
            </div>
          </div>
        )}

        {/* AI AGENT SPEND */}
        {!loading && brief?.ai && (
          <div className="wb-group">
            <div className="wb-glabel">AI agents <span className="n">· spend, today &amp; yesterday</span> <InfoButton title="AI agent spend" {...AI_SPEND_EXPLAINER} /></div>
            <div className="wb-grid4">
              <div className="wb-tcell">
                <div className="k">Today</div>
                <div className="v wb-num">{exact(brief.ai.todayGrosze)}</div>
                <div className="d">{brief.ai.budgetGrosze > 0 ? `${Math.round((brief.ai.todayGrosze / brief.ai.budgetGrosze) * 100)}% of budget` : "no budget set"}</div>
              </div>
              <div className="wb-tcell">
                <div className="k">Yesterday</div>
                <div className="v wb-num">{exact(brief.ai.yesterdayGrosze)}</div>
                {brief.ai.yesterdayGrosze > 0 ? (
                  <div className={`d ${brief.ai.todayGrosze >= brief.ai.yesterdayGrosze ? "up" : "down"}`}>{brief.ai.todayGrosze >= brief.ai.yesterdayGrosze ? "▲" : "▼"} {Math.abs(Math.round(((brief.ai.todayGrosze - brief.ai.yesterdayGrosze) / brief.ai.yesterdayGrosze) * 100))}% vs today</div>
                ) : <div className="d">full day</div>}
              </div>
              <div className="wb-tcell">
                <div className="k">Daily budget</div>
                <div className="v wb-num">{brief.ai.budgetGrosze > 0 ? exact(brief.ai.budgetGrosze) : "—"}</div>
                <div className="d">the cap on AI spend</div>
              </div>
            </div>
            <Link className="wb-lk" href={link("/admin/agent-hq")}>Open Agent HQ →</Link>
          </div>
        )}

        {/* ANOMALY */}
        {!loading && brief?.anomaly && (
          <div className="wb-group">
            <div className="wb-glabel">Worth copying</div>
            <div className="wb-anom"><b>{brief.anomaly.city}</b>’s average ticket — <b>{exact(brief.anomaly.avgTicketGrosze)}</b> — runs <b>{brief.anomaly.deltaPct}% above</b> the chain ({exact(brief.anomaly.chainAvgGrosze)}). Whatever’s working there is worth rolling out everywhere.</div>
          </div>
        )}

        {/* LOCATIONS */}
        {!loading && brief && brief.locations.length > 0 && (
          <div className="wb-group">
            <div className="wb-glabel">By location <span className="n">· yesterday</span></div>
            {brief.locations.map((l) => (
              <div className="wb-loc" key={l.slug}>
                <div><div className="nm">{l.city}</div><div className="sub">{l.orderCount} orders{l.avgOrderValue ? ` · ${exact(l.avgOrderValue)} avg` : ""}</div></div>
                <div className="val wb-num">{compact(l.revenue)}</div>
              </div>
            ))}
          </div>
        )}

        {/* TODAY AHEAD */}
        {!loading && y && (goal > 0 || forecast != null) && (
          <div className="wb-group">
            <div className="wb-glabel">Today, ahead</div>
            <div className="wb-today">
              <div className="wb-tcell"><div className="k">Revenue goal</div><div className="v wb-num">{goal > 0 ? compact(goal) : "—"}</div></div>
              <div className="wb-tcell"><div className="k">Forecast</div><div className="v wb-num">{forecast != null ? compact(forecast) : "—"}</div><div className="d">{forecast != null && brief?.today.pacePct != null ? `${brief.today.pacePct}% of goal` : "labour model"}</div></div>
              <div className="wb-tcell"><div className="k">Profit / order</div><div className="v wb-num">{exact(y.perOrderProfitGrosze)}</div><div className="d">{Math.round(y.profitMargin)}% margin</div></div>
            </div>
          </div>
        )}

        {/* YESTERDAY RECAP (demoted) */}
        {!loading && y && (
          <div className="wb-group">
            <div className="wb-glabel">Yesterday · for the record</div>
            <div className="wb-recap">
              <span className="it"><b>{y.orders}</b> orders</span>
              <span className="it">avg <b>{exact(y.avgOrderValue)}</b></span>
              <span className="it">margin <b>{Math.round(y.profitMargin)}%</b></span>
              {y.topItems.map((t) => (<span className="it" key={t.name}>{t.name} <b>×{t.quantity}</b></span>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rule #12 explainers — five required sections, złoty-grounded ───────────────
const PACING_EXPLAINER = {
  description: "Where this month's revenue is heading versus your goal, projected from the run-rate so far.",
  institutional: "The board reads pace, not the raw month-to-date total — a big number on day 28 means nothing without the target. A projection landing within ±5% of goal is on-track; more than 10% short with the month half-gone is a miss you still have time to correct. The month target is your daily revenue goal × the calendar days in the month.",
  plain: "Say you've booked 770 000 zł by day 12 of a 30-day month — that's ~64 000 zł/day, so you're on pace for ~1 925 000 zł. If the month's goal is 1 800 000 zł you're ~125 000 zł ahead: bank it, don't coast.",
  tips: "Lift the run-rate before month-end — push the highest-margin combos, add a delivery window on your strongest weekday, and convert the bookings pipeline below into confirmed events. Set the daily revenue goal in the Dashboard; it's what this target is built from.",
  methodology: "MTD = getSummary(month-start…today).totalRevenue. Projection = MTD ÷ day-of-month × days-in-month. Goal = ops-goals dailyRevenueGoal × days-in-month. Ahead/behind = projection − goal. Computed server-side in /api/admin/welcome.",
};
const CONSTRAINT_EXPLAINER = {
  description: "The hour of the day that carries your heaviest order load, averaged over the last 30 days.",
  institutional: "Throughput, not demand, caps a truck's revenue: the peak hour is where the queue forms and orders get turned away. Theory-of-constraints says you grow the whole system only by relieving its tightest link — so staffing, prep or oven capacity bought for this one hour returns more than any off-peak change.",
  plain: "If 18:00–19:00 runs ~28 orders/hour while the rest of the day sits at 8, that hour is your ceiling. Add a second pizzaiolo or pre-stretch dough for that window and you sell more in 60 minutes than a whole quiet afternoon — maybe 600 zł a night you were leaving on the table.",
  tips: "Pre-prep before the peak, schedule your strongest hands onto it, and shift demand off it with a 'beat-the-rush' early-bird nudge. Watch late-ticket counts in KDS during this hour — that's the constraint biting.",
  methodology: "computeHourlyThroughput(30 days) buckets every non-cancelled order by created-hour and divides by active days; the brief surfaces the hour with the highest average orders/hour. Source: getOrders. Computed server-side in /api/admin/welcome.",
};
const REPEAT_EXPLAINER = {
  description: "The share of identified customers in the last 30 days who have ordered from you more than once.",
  institutional: "Retention is the cheapest growth there is — a repeat guest costs nothing to reacquire. Quick-service benchmarks put a healthy repeat rate around 30–40%; below 20% you're running a leaky bucket that marketing złoty only tops up. Read it alongside new-customers/month — you want both climbing.",
  plain: "Of 200 guests who left a phone number this month, if 84 have ordered before that's a 42% repeat rate — four in ten come back. Nudge ten more passives into a second order and you've added recurring revenue without spending a złoty on ads.",
  tips: "Trigger a 'we miss you' offer at a guest's normal reorder gap, make loyalty points visible at checkout, and fix the top detractor snag the Pulse score flags. A strong peak experience and the bookings pipeline both feed repeats.",
  methodology: "computeCohortSnapshot(30 days): customers with ≥2 orders ÷ all identified customers in the window, ×100. Source: getOrders keyed by phone. Computed server-side in /api/admin/welcome.",
};
const PULSE_EXPLAINER = {
  description: "Net guest sentiment — promoters minus detractors as a share of all answers — on a −100…+100 scale, from the one-tap 5★ survey.",
  institutional: "A continuous voice-of-customer instrument, not a one-off CSAT poll. The gate: a Pulse below 0 means more detractors than promoters — a churn signal; steer for 30+. Trust it only off enough volume — a high score from three answers is noise, which is why the trend needs ≥3 answers in each 30-day window.",
  plain: "If 60 guests answered this month — 33 gave 5★ (promoters), 9 gave ≤3★ (detractors) — your Pulse is round((33−9)/60×100) = +40. A ▲ on last month means the fixes are landing; a ▼ means a snag is spreading before it shows up in revenue.",
  tips: "Open Surveys → Responses and fix the top recurring detractor comment first; turn 4★ passives into promoters with a small post-order delight; activate the survey whose 'fires-on' moment you most want to read.",
  methodology: "pulseBreakdown over getSurveyResponses: promoter = 5★, detractor ≤ 3★, passive = 4★; Pulse = round((promoters − detractors) ÷ total × 100). Last-30-day window, with the trend versus the prior 30 days. Computed server-side in /api/admin/welcome.",
};
const AI_SPEND_EXPLAINER = {
  description: "What your AI agents cost in LLM spend today versus yesterday, against the daily budget that caps them.",
  institutional: "AI spend is an operating cost that must earn its keep — read it next to the decisions and segments the agents produced. The gate is the daily budget: spend running flat at the cap day after day means the board is throttled (raise it or the briefings truncate); a sudden drop to zero means the agents stopped working (missing API key, budget exhausted, or — by design — Sandbox mode paused every job). A non-zero figure here is the receipt that the autonomous board actually ran on your numbers. In Simulation mode this is exactly your dry-run check: the agents analyse the data you hand-entered, and this is what that analysis cost.",
  plain: "Say yesterday the daily briefing + segment rebuild cost 3.40 zł and today's chat + meetings are at 1.10 zł so far — you're at 1.10 of, say, a 20 zł budget (≈6%). If today still read 0.00 by mid-morning you'd know the agents never fired and go check the key or the budget.",
  tips: "Raise or lower the cap in Agent HQ → Settings → daily AI budget; turn the daily auto-briefing on/off there too. If spend is pinned at the cap, either lift it or trim each agent's per-run cap so the budget spreads across more agents. If it's zero when it shouldn't be, confirm ANTHROPIC_API_KEY is set and you're not in Sandbox mode.",
  methodology: "getAiSpendTodayYesterdayGrosze sums two ledgers per Warsaw day — ai_messages.cost_grosze (chat) + off-ledger meeting/schedule/work agent-events — bucketed into today vs yesterday by Warsaw midnight (DST-correct). Budget = getEffectiveDailyBudgetGrosze (the Agent HQ override of AI_DAILY_BUDGET_GROSZE). Computed server-side in /api/admin/welcome.",
};
