"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Coins,
  Flame,
  Pencil,
  Percent,
  PiggyBank,
  Receipt,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { isLocationOpenNow } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { AreaChart, Badge, Button, Card, CardBody, CardHead, ChipRow, type ColumnV3, Kpi, KpiRail, SkeletonPage, Table } from "./ui";

// ── helpers ────────────────────────────────────────────────────────────────
// Sentinel returned by okJson when a request did NOT yield a usable response
// (HTTP error like a rate-limit 429, a transient 500, or a network/parse
// failure). Callers compare against it to decide "skip this update" vs "apply
// this response" — the distinction the old `r.ok ? json : null` collapsed,
// which let a single failed poll blank the entire dashboard to 0.
const FETCH_FAILED = Symbol("fetch-failed");
async function okJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url);
    if (!r.ok) return FETCH_FAILED;
    return await r.json();
  } catch {
    return FETCH_FAILED;
  }
}

function zl(grosze: number): string {
  return `${Math.round(grosze / 100).toLocaleString("pl-PL")} zł`;
}
function isoDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function pctDelta(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}
function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// ── payload shapes (the subset we read) ─────────────────────────────────────
interface DailyStat { date: string; revenue: number; orderCount: number }
interface TopItem { name: string; quantity: number; revenue: number }
interface Summary {
  totalRevenue: number;
  totalProfit: number;
  profitMargin: number; // whole-number percent
  totalOrders: number;
  avgOrderValue: number; // grosze
  dailyStats?: DailyStat[];
  topItems?: TopItem[];
}
interface LocCompare {
  locationSlug: string;
  city: string;
  revenue: number;
  profit?: number;
  profitMargin?: number;
  orderCount: number;
  avgOrderValue?: number;
  cancellationRate?: number;
}
interface Insights {
  avgItemsPerOrder: number;
  cancellationRate: number; // whole-number percent
  locationComparison: LocCompare[];
}

// ── executive overview (analytics report — matches the dashboard mockup) ─────
type ExecPeriod = "today" | "7d" | "30d" | "90d";
const EX_DAYS: Record<ExecPeriod, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
const EX_OPTS: { value: ExecPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];
function execRange(period: ExecPeriod) {
  const days = EX_DAYS[period];
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400000);
  const pTo = new Date(from.getTime() - 86400000);
  const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
  return { from: isoDay(from), to: isoDay(to), pFrom: isoDay(pFrom), pTo: isoDay(pTo) };
}
interface FleetTile {
  slug: string;
  name: string;
  counts: { active: number; ready: number; late: number; risk: number };
  onShift: number;
  revenueToday: number;
  bottleneck: { label: string; pct: number; tier: string } | null;
}
interface Fleet {
  totals: { active: number; ready: number; late: number; risk: number; coversHr: number };
  tiles: FleetTile[];
}
interface LaborEff {
  perLocation: {
    locationSlug: string;
    today: { forecastOrders: number; forecastSource: "ai" | "trailing-week" | "none" };
  }[];
}
interface OrderRow {
  id: string;
  locationSlug: string;
  status: string;
  totalAmount: number;
  customerName: string;
  createdAt: string;
  slotDate?: string;
  fulfillmentType?: string;
  partySize?: number;
}
interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}
interface OpsGoals {
  dailyRevenueGoalGrosze: number;
  byLocation: Record<string, number>;
}

const NOTIF_TONE: Record<string, "ok" | "warn" | "bad" | "info"> = {
  new_order: "info",
  order_status: "ok",
  daily_summary: "info",
  slot_full: "warn",
  low_slots: "warn",
  low_stock: "warn",
  bundle_low_margin: "warn",
  dispute: "bad",
};

export function DashboardV3() {
  const { location, activeLocations } = useAdminLocationV3();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prev, setPrev] = useState<Summary | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [laborRatio, setLaborRatio] = useState<{ ratio: number | null } | null>(null);
  const [laborEff, setLaborEff] = useState<LaborEff | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [goals, setGoals] = useState<OpsGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Tracks whether the core summary has ever loaded. Used to drive a fast
  // self-heal retry when the first poll(s) come back failed (e.g. a cold
  // rate-limit window) instead of leaving the operator on 0s for a full 30s.
  const loadedOnce = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempts = useRef(0);

  // goal editor
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  // executive overview (analytics report) — own period + payloads
  const [exPeriod, setExPeriod] = useState<ExecPeriod>("7d");
  const [exec, setExec] = useState<Summary | null>(null);
  const [execLoading, setExecLoading] = useState(true);
  const [execPrev, setExecPrev] = useState<Summary | null>(null);
  const [execIns, setExecIns] = useState<Insights | null>(null);
  const [execInsPrev, setExecInsPrev] = useState<Insights | null>(null);

  const fetchExec = useCallback(async () => {
    const { from, to, pFrom, pTo } = execRange(exPeriod);
    const loc = location ? `&location=${location}` : "";
    try {
      const [cur, prevp, ins, insPrev] = await Promise.all([
        okJson(`/api/admin/analytics?from=${from}&to=${to}${loc}`),
        okJson(`/api/admin/analytics?from=${pFrom}&to=${pTo}${loc}`),
        okJson(`/api/admin/insights?from=${from}&to=${to}`),
        okJson(`/api/admin/insights?from=${pFrom}&to=${pTo}`),
      ]);
      // Only overwrite on a genuine response. A failed poll (rate-limit 429,
      // transient 500, network blip) returns FETCH_FAILED, and clobbering the
      // last-good value with that is what made the cards flash to 0 between
      // 30s refresh cycles — keep showing the prior numbers instead.
      if (cur !== FETCH_FAILED) setExec(cur as Summary | null);
      if (prevp !== FETCH_FAILED) setExecPrev(prevp as Summary | null);
      if (ins !== FETCH_FAILED) setExecIns(ins as Insights | null);
      if (insPrev !== FETCH_FAILED) setExecInsPrev(insPrev as Insights | null);
    } catch (err) {
      console.error("Executive overview refresh failed:", err);
    } finally {
      setExecLoading(false);
    }
  }, [exPeriod, location]);

  useEffect(() => { setExecLoading(true); fetchExec(); }, [fetchExec]);

  const fetchAll = useCallback(async () => {
    const today = isoDay();
    const yest = isoDay(new Date(Date.now() - 86400000));
    const loc = location ? `&location=${location}` : "";
    const locQ = location ? `?location=${location}` : "";
    try {
      const [a, b, ins, fl, lr, le, ord, nt, gl] = await Promise.all([
        okJson(`/api/admin/analytics?from=${today}&to=${today}${loc}`),
        okJson(`/api/admin/analytics?from=${yest}&to=${yest}${loc}`),
        okJson(`/api/admin/insights?from=${today}&to=${today}`),
        okJson(`/api/admin/kds/fleet`),
        okJson(`/api/admin/labor-ratio${locQ}`),
        okJson(`/api/admin/labor-efficiency`),
        okJson(`/api/admin/orders${locQ}`),
        okJson(`/api/admin/notifications`),
        okJson(`/api/admin/ops-goals`),
      ]);
      // A failed poll returns FETCH_FAILED — never let it overwrite the last
      // good value, or the whole board flashes to 0 mid-shift the moment one
      // 30s refresh cycle gets rate-limited / errors (see okJson). A real
      // response (even an empty one) still updates as normal.
      if (a !== FETCH_FAILED) setSummary(a as Summary | null);
      if (b !== FETCH_FAILED) setPrev(b as Summary | null);
      if (ins !== FETCH_FAILED) setInsights(ins as Insights | null);
      if (fl !== FETCH_FAILED) setFleet(fl as Fleet | null);
      if (lr !== FETCH_FAILED) setLaborRatio(lr as { ratio: number | null } | null);
      if (le !== FETCH_FAILED) setLaborEff(le as LaborEff | null);
      if (Array.isArray(ord)) setOrders(ord as OrderRow[]);
      if (Array.isArray(nt)) setNotifs(nt as Notif[]);
      if (gl !== FETCH_FAILED) setGoals(gl as OpsGoals | null);
      if (a !== FETCH_FAILED) {
        loadedOnce.current = true;
        retryAttempts.current = 0;
      } else if (!loadedOnce.current && retryAttempts.current < 3) {
        // First load(s) failed and we have nothing to show yet — retry a few
        // times soon rather than waiting out the full 30s poll interval. Bounded
        // so a sustained outage falls back to the 30s cadence instead of
        // hammering a struggling API every 4s forever.
        retryAttempts.current += 1;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => { void fetchAll(); }, 4000);
      }
    } catch (err) {
      console.error("Operator Terminal refresh failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [location]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    // Refresh the Executive overview on the same cadence as the rest of the
    // board. Without this the exec rail only reloaded on mount / period change /
    // manual Refresh, so a single bad load left it stranded (e.g. showing 0)
    // while the polling sections moved on — a board that contradicts itself.
    const t = setInterval(() => { fetchAll(); fetchExec(); }, 30_000);
    return () => {
      clearInterval(t);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [fetchAll, fetchExec]);

  // ── derived ───────────────────────────────────────────────────────────────
  const scopeCity = location ? activeLocations.find((l) => l.slug === location)?.city ?? location : "All locations";

  // fleet, scoped
  const fleetScope = useMemo(() => {
    if (!fleet) return null;
    if (location) {
      const t = fleet.tiles.find((x) => x.slug === location);
      return t ? { active: t.counts.active, ready: t.counts.ready, late: t.counts.late } : { active: 0, ready: 0, late: 0 };
    }
    return { active: fleet.totals.active, ready: fleet.totals.ready, late: fleet.totals.late };
  }, [fleet, location]);

  const revenue = summary?.totalRevenue ?? 0;
  const goal = goals ? (location ? goals.byLocation[location] || 0 : goals.dailyRevenueGoalGrosze || 0) : 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round((revenue / goal) * 100)) : null;

  // forecast projection — real, from labor-efficiency forecastOrders × AOV
  const projection = useMemo(() => {
    if (!laborEff || !summary) return null;
    const rows = location
      ? laborEff.perLocation.filter((p) => p.locationSlug === location)
      : laborEff.perLocation;
    const forecastOrders = rows.reduce((s, p) => s + (p.today?.forecastOrders ?? 0), 0);
    const hasForecast = rows.some((p) => p.today?.forecastSource && p.today.forecastSource !== "none");
    if (!hasForecast || forecastOrders <= 0) return null;
    const aov = summary.avgOrderValue || prev?.avgOrderValue || 0;
    const remaining = Math.max(0, forecastOrders - summary.totalOrders);
    return revenue + remaining * aov;
  }, [laborEff, summary, prev, location, revenue]);

  // covers today, from real orders
  const covers = useMemo(() => {
    const today = isoDay();
    return orders
      .filter((o) => (o.slotDate || o.createdAt.slice(0, 10)) === today && o.status !== "cancelled")
      .reduce((s, o) => s + (o.partySize && o.partySize > 0 ? o.partySize : 1), 0);
  }, [orders]);

  // order flow — orders/min last 60 min, 12 buckets of 5 min
  const flow = useMemo(() => {
    const now = Date.now();
    const buckets = new Array(12).fill(0);
    for (const o of orders) {
      const age = now - new Date(o.createdAt).getTime();
      if (age < 0 || age > 60 * 60000) continue;
      const idx = 11 - Math.min(11, Math.floor(age / (5 * 60000)));
      buckets[idx]++;
    }
    return buckets;
  }, [orders]);
  const flowMax = Math.max(1, ...flow);

  const ratioPct = laborRatio?.ratio != null ? laborRatio.ratio * 100 : null;
  const margin = summary?.profitMargin ?? 0;
  const aov = summary?.avgOrderValue ?? 0;
  const itemsPerOrder = insights?.avgItemsPerOrder ?? 0;

  // trucks
  const trucks = useMemo(() => {
    if (!fleet) return [];
    const tiles = location ? fleet.tiles.filter((t) => t.slug === location) : fleet.tiles;
    return tiles.map((t) => {
      const locData = activeLocations.find((l) => l.slug === t.slug);
      return {
        slug: t.slug,
        city: locData?.city ?? t.name,
        open: locData ? isLocationOpenNow(locData) : true,
        onLine: t.counts.active,
        onShift: t.onShift,
        revenueToday: t.revenueToday,
        bottleneck: t.bottleneck,
      };
    });
  }, [fleet, location, activeLocations]);

  // live feed — real notifications, newest first
  const feed = useMemo(
    () =>
      [...notifs]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 14),
    [notifs],
  );

  // needs you now — derived from real signals
  const needs = useMemo(() => {
    const out: { tone: string; text: string; action?: string }[] = [];
    if (fleetScope && fleetScope.late > 0) out.push({ tone: "var(--av3-bad)", text: `${fleetScope.late} ticket${fleetScope.late > 1 ? "s" : ""} past promise`, action: "Expedite" });
    const lowStock = notifs.filter((n) => n.type === "low_stock" && !n.read).length;
    if (lowStock > 0) out.push({ tone: "var(--av3-warn)", text: `${lowStock} ingredient${lowStock > 1 ? "s" : ""} below reorder`, action: "Reorder" });
    const slotAlerts = notifs.filter((n) => (n.type === "slot_full" || n.type === "low_slots") && !n.read).length;
    if (slotAlerts > 0) out.push({ tone: "var(--av3-warn)", text: `${slotAlerts} slot alert${slotAlerts > 1 ? "s" : ""}`, action: "Open" });
    const disputes = notifs.filter((n) => n.type === "dispute" && !n.read).length;
    if (disputes > 0) out.push({ tone: "var(--av3-bad)", text: `${disputes} payment dispute${disputes > 1 ? "s" : ""}`, action: "Review" });
    return out.slice(0, 4);
  }, [fleetScope, notifs]);

  // what moves it most — ranked real levers
  const moves = useMemo(() => {
    const out: { icon: typeof Target; text: string; impact: string; sev: number }[] = [];
    if (goal > 0 && revenue < goal) out.push({ icon: Target, text: "Behind today's goal — AOV is the fastest lever", impact: zl(goal - revenue), sev: 3 });
    if (fleetScope && fleetScope.late > 0) out.push({ icon: AlertTriangle, text: "Late tickets are stalling covers — expedite", impact: `${fleetScope.late} late`, sev: 5 });
    const worstBottleneck = (location ? trucks : trucks).map((t) => t.bottleneck).filter(Boolean).sort((a, b) => (b!.pct - a!.pct))[0];
    if (worstBottleneck && worstBottleneck.pct >= 75) out.push({ icon: Flame, text: `${worstBottleneck.label} running hot — ease the line`, impact: `${worstBottleneck.pct}%`, sev: 4 });
    if (ratioPct != null && ratioPct > 32) out.push({ icon: Coins, text: "Labour ratio high — consider trimming shifts", impact: `${ratioPct.toFixed(0)}%`, sev: 4 });
    if (itemsPerOrder > 0 && itemsPerOrder < 2) out.push({ icon: TrendingUp, text: "Low attach — prompt a dessert or drink at checkout", impact: `${itemsPerOrder.toFixed(1)}/order`, sev: 2 });
    return out.sort((a, b) => b.sev - a.sev).slice(0, 4);
  }, [goal, revenue, fleetScope, trucks, location, ratioPct, itemsPerOrder]);

  // ── goal editor ─────────────────────────────────────────────────────────
  const openGoalEditor = () => {
    setGoalDraft(goal > 0 ? String(Math.round(goal / 100)) : "");
    setEditingGoal(true);
  };
  const saveGoal = async () => {
    const zlVal = Math.max(0, Math.round(Number(goalDraft) || 0));
    setSavingGoal(true);
    try {
      const body = location
        ? { location, goalGrosze: zlVal * 100 }
        : { dailyRevenueGoalGrosze: zlVal * 100 };
      const r = await fetch("/api/admin/ops-goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) setGoals(await r.json());
      setEditingGoal(false);
    } catch {
      /* non-fatal */
    } finally {
      setSavingGoal(false);
    }
  };

  if (loading && !summary) {
    return (
      <SkeletonPage kpis={4} />
    );
  }

  const revDelta = pctDelta(revenue, prev?.totalRevenue ?? 0);
  const aovDelta = pctDelta(aov, prev?.avgOrderValue ?? 0);
  const marginDelta = pctDelta(margin, prev?.profitMargin ?? 0);

  // ── executive overview derivations ─────────────────────────────────────────
  const exDaily = exec?.dailyStats ?? [];
  const exRevSpark = exDaily.map((d) => Math.round(d.revenue / 100));
  const exOrdSpark = exDaily.map((d) => d.orderCount);
  const exAovSpark = exDaily.map((d) => (d.orderCount ? Math.round(d.revenue / d.orderCount / 100) : 0));
  const exTop = (exec?.topItems ?? []).slice(0, 6);
  const exTopMax = Math.max(1, ...exTop.map((t) => t.revenue));
  const exCancel = execIns?.cancellationRate ?? 0;
  const exLocRows = execIns?.locationComparison ?? [];
  const exPeak = exDaily.length ? Math.max(...exDaily.map((d) => d.revenue)) : 0;
  const exRevDelta = pctDelta(exec?.totalRevenue ?? 0, execPrev?.totalRevenue ?? 0);
  const exOrdDelta = pctDelta(exec?.totalOrders ?? 0, execPrev?.totalOrders ?? 0);
  const exAovDelta = pctDelta(exec?.avgOrderValue ?? 0, execPrev?.avgOrderValue ?? 0);
  const exMarginDelta = pctDelta(exec?.profitMargin ?? 0, execPrev?.profitMargin ?? 0);
  const exProfitDelta = pctDelta(exec?.totalProfit ?? 0, execPrev?.totalProfit ?? 0);
  const exCancelDelta = pctDelta(exCancel, execInsPrev?.cancellationRate ?? 0);
  const locCols: ColumnV3<LocCompare>[] = [
    { key: "city", header: "Location", render: (l) => <span style={{ fontWeight: 600 }}>{l.city}</span> },
    { key: "rev", header: "Revenue", num: true, render: (l) => formatPrice(l.revenue) },
    { key: "ord", header: "Orders", num: true, render: (l) => l.orderCount.toLocaleString("pl-PL") },
    { key: "aov", header: "AOV", num: true, render: (l) => formatPrice(l.avgOrderValue ?? 0) },
    { key: "mar", header: "Margin", num: true, render: (l) => `${(l.profitMargin ?? 0).toFixed(0)}%` },
    { key: "can", header: "Cancel", num: true, render: (l) => `${(l.cancellationRate ?? 0).toFixed(0)}%` },
  ];

  return (
    <>
      <div className="av3-now">
        <span className="av3-live-dot" aria-hidden />
        <span className="av3-section-label" style={{ marginBottom: 0 }}>Live · {scopeCity}</span>
        <span className="mono" style={{ color: "var(--av3-muted)", fontSize: 12.5, fontFamily: "var(--av3-mono)" }}>
          {new Date().toLocaleString("pl-PL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); fetchAll(); fetchExec(); }} style={{ marginLeft: "auto" }}>
          <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} />
          Refresh
        </Button>
      </div>

      {/* HERO — revenue → daily goal */}
      <div className="av3-goalbar">
        <div className="av3-goalbar-head">
          <Banknote />
          Revenue today {goal > 0 ? "· to daily goal" : ""}
          <button type="button" className="av3-btn av3-btn-ghost av3-btn-sm av3-goal-edit" onClick={openGoalEditor}>
            <Pencil className="av3-btn-ico" /> {goal > 0 ? "Edit goal" : "Set goal"}
          </button>
        </div>
        <div className="av3-goalbar-value">{zl(revenue)}</div>
        {goal > 0 ? (
          <div className="av3-goalbar-sub">
            {goalPct}% of <b style={{ color: "var(--av3-fg)" }}>{zl(goal)}</b>
            {projection != null && <> · on pace for <b style={{ color: projection >= goal ? "var(--av3-ok)" : "var(--av3-warn)" }}>{zl(projection)}</b> by close</>}
          </div>
        ) : (
          <div className="av3-goalbar-sub">
            No daily goal set{projection != null && <> · forecast on pace for <b style={{ color: "var(--av3-ok)" }}>{zl(projection)}</b> by close</>}
            {revDelta != null && <> · {revDelta >= 0 ? "+" : ""}{revDelta.toFixed(1)}% vs yesterday</>}
          </div>
        )}
        {goal > 0 && (
          <div className="av3-goalbar-prog"><i style={{ width: `${goalPct}%` }} /></div>
        )}
        {editingGoal && (
          <div className="av3-goal-editrow">
            <span style={{ fontSize: 12, color: "var(--av3-muted)" }}>{location ? `${scopeCity} daily goal` : "Chain daily goal"} (zł)</span>
            <input
              className="av3-goal-input"
              type="number"
              min={0}
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              placeholder="e.g. 42000"
              autoFocus
            />
            <Button variant="primary" size="sm" loading={savingGoal} onClick={saveGoal}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingGoal(false)}>Cancel</Button>
          </div>
        )}
      </div>

      {/* live tiles */}
      <div className="av3-tiles">
        <div className="av3-tile"><div className="av3-tile-l"><ChefHat />Cooking</div><div className="av3-tile-v" style={{ color: "var(--av3-warn)" }}>{fleetScope?.active ?? 0}</div><div className="av3-tile-s">on the line now</div></div>
        <div className="av3-tile"><div className="av3-tile-l"><CheckCircle2 />Ready</div><div className="av3-tile-v" style={{ color: "var(--av3-ok)" }}>{fleetScope?.ready ?? 0}</div><div className="av3-tile-s">awaiting handoff</div></div>
        <div className="av3-tile"><div className="av3-tile-l"><AlertTriangle />Due / late</div><div className="av3-tile-v" style={{ color: (fleetScope?.late ?? 0) > 0 ? "var(--av3-bad)" : "var(--av3-fg)" }}>{fleetScope?.late ?? 0}</div><div className="av3-tile-s">past promised time</div></div>
        <div className="av3-tile"><div className="av3-tile-l"><Users />Covers today</div><div className="av3-tile-v">{covers.toLocaleString("pl-PL")}</div><div className="av3-tile-s">{summary?.totalOrders ?? 0} orders</div></div>
      </div>

      {/* EXECUTIVE OVERVIEW — period-scoped analytics report (dashboard mockup) */}
      <div className="av3-now" style={{ marginTop: 4 }}>
        <TrendingUp style={{ width: 14, height: 14, color: "var(--av3-muted)" }} />
        <span className="av3-section-label" style={{ marginBottom: 0 }}>Executive overview · {scopeCity}</span>
        <span style={{ marginLeft: "auto" }}>
          <ChipRow options={EX_OPTS} value={exPeriod} onChange={setExPeriod} ariaLabel="Executive period" />
        </span>
      </div>

      <KpiRail loading={execLoading} empty={!exec}>
        <Kpi label="Revenue" icon={Banknote} value={zl(exec?.totalRevenue ?? 0)} deltaPct={exRevDelta} spark={exRevSpark} accentVar="--av3-c1" />
        <Kpi label="Orders" icon={ClipboardList} value={(exec?.totalOrders ?? 0).toLocaleString("pl-PL")} deltaPct={exOrdDelta} spark={exOrdSpark} accentVar="--av3-c3" />
        <Kpi label="Avg order" icon={Receipt} value={formatPrice(exec?.avgOrderValue ?? 0)} deltaPct={exAovDelta} spark={exAovSpark} accentVar="--av3-c2" />
        <Kpi label="Profit margin" icon={Percent} value={`${(exec?.profitMargin ?? 0).toFixed(0)}%`} deltaPct={exMarginDelta} accentVar="--av3-c4" />
        <Kpi label="Gross profit" icon={PiggyBank} value={zl(exec?.totalProfit ?? 0)} deltaPct={exProfitDelta} accentVar="--av3-c4" />
        <Kpi label="Cancellations" icon={XCircle} value={`${exCancel.toFixed(1)}%`} deltaPct={exCancelDelta} invertDelta accentVar="--av3-c1" />
        <Kpi label="Labour ratio" icon={Coins} value={ratioPct != null ? `${ratioPct.toFixed(0)}%` : "—"} accentVar="--av3-c3" />
      </KpiRail>

      <div className="av3-grid-2-1">
        <Card>
          <CardHead title="Revenue trend" description={`Daily revenue · ${exPeriod === "today" ? "today" : `last ${EX_DAYS[exPeriod]} days`}`} />
          <CardBody>
            {exRevSpark.length < 2 ? (
              <div className="av3-empty"><div className="av3-empty-text">Not enough days in range to chart.</div></div>
            ) : (
              <AreaChart data={exRevSpark} height={150} accentVar="--av3-c1" caption={[exDaily[0]?.date ?? "", `peak ${zl(exPeak)}`]} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHead title="Top sellers" description="By revenue this period" />
          <CardBody>
            {exTop.length === 0 ? (
              <div className="av3-empty"><div className="av3-empty-text">No items sold in range.</div></div>
            ) : (
              <div className="av3-bars">
                {exTop.map((t) => (
                  <div className="av3-bar-row" key={t.name}>
                    <div style={{ minWidth: 0 }}>
                      <div className="av3-bar-label">{t.name}</div>
                      <div className="av3-bar-track"><div className="av3-bar-fill" style={{ width: `${Math.max(4, (t.revenue / exTopMax) * 100)}%` }} /></div>
                    </div>
                    <div className="av3-bar-val">{zl(t.revenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead title="Location network" description="Revenue, orders and margin by site" actions={<Badge tone="neutral">{exLocRows.length} sites</Badge>} />
        {exLocRows.length === 0 ? (
          <CardBody><div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No location data in range.</div></CardBody>
        ) : (
          <Table columns={locCols} rows={exLocRows} rowKey={(l) => l.locationSlug} />
        )}
      </Card>

      {/* body split: work column | live feed */}
      <div className="av3-bodysplit">
        <div className="av3-col">
          {/* levers */}
          <div>
            <div className="av3-section-label" style={{ marginBottom: 10 }}>The levers that move the goal</div>
            <div className="av3-levers">
              <Lever label="Avg order value" value={zl(aov)} delta={aovDelta} meter={Math.min(100, (aov / 5000) * 100)} color="var(--av3-c4)" tgt="benchmark 50 zł" />
              <Lever label="Items / order" value={itemsPerOrder.toFixed(1)} meter={Math.min(100, (itemsPerOrder / 3) * 100)} color="var(--av3-c5)" tgt="attach target 3.0" />
              <Lever label="Profit margin" value={`${margin.toFixed(0)}%`} delta={marginDelta} meter={Math.min(100, (margin / 65) * 100)} color="var(--av3-c2)" tgt="target 65%" />
              <Lever label="Labour ratio" value={ratioPct != null ? `${ratioPct.toFixed(0)}%` : "—"} meter={ratioPct != null ? Math.min(100, (ratioPct / 28) * 100) : 0} color={ratioPct != null && ratioPct > 28 ? "var(--av3-bad)" : "var(--av3-c3)"} tgt="healthy 22–28%" />
            </div>
          </div>

          {/* what moves it most */}
          <div className="av3-card">
            <div className="av3-card-head"><div><div className="av3-card-title">What moves it most</div><div className="av3-card-desc">Ranked by what’s pulling on today’s result right now</div></div></div>
            <div className="av3-card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
              {moves.length === 0 ? (
                <div className="av3-empty"><div className="av3-empty-title">All levers healthy</div><div className="av3-empty-text">Nothing is dragging on the number right now.</div></div>
              ) : (
                moves.map((m, i) => {
                  const Icon = m.icon;
                  return (
                    <div className="av3-move" key={i}>
                      <span className="av3-move-ic"><Icon /></span>
                      <span className="av3-move-txt">{m.text}</span>
                      <span className="av3-move-imp">{m.impact}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* kitchen pace + trucks */}
          <div className="av3-mini2">
            <div className="av3-card">
              <div className="av3-card-head"><div className="av3-card-title">Kitchen pace</div>{fleet && (fleetScope?.late ?? 0) > 0 ? <span className="av3-badge av3-badge-bad"><span className="av3-badge-dot" />behind</span> : <span className="av3-badge av3-badge-ok"><span className="av3-badge-dot" />on time</span>}</div>
              <div className="av3-card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
                {trucks.filter((t) => t.bottleneck).length === 0 ? (
                  <div className="av3-empty"><div className="av3-empty-text">Line is quiet — no station under pressure.</div></div>
                ) : (
                  trucks.filter((t) => t.bottleneck).map((t) => (
                    <div className="av3-station" key={t.slug}>
                      <span className="av3-station-nm">{t.bottleneck!.label}</span>
                      <span className="av3-gbar"><i style={{ width: `${Math.min(100, t.bottleneck!.pct)}%`, background: t.bottleneck!.pct >= 85 ? "var(--av3-bad)" : t.bottleneck!.pct >= 70 ? "var(--av3-warn)" : "var(--av3-ok)" }} /></span>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--av3-muted)", fontFamily: "var(--av3-mono)" }}>{t.bottleneck!.pct}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="av3-card">
              <div className="av3-card-head"><div className="av3-card-title">Locations</div></div>
              <div className="av3-card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
                {trucks.length === 0 ? (
                  <div className="av3-empty"><div className="av3-empty-text">No location data.</div></div>
                ) : (
                  trucks.map((t) => (
                    <div className="av3-truck" key={t.slug}>
                      <span className="av3-live-dot" style={{ background: t.open ? "var(--av3-ok)" : "var(--av3-subtle)", animation: t.open ? undefined : "none" }} aria-hidden />
                      <div style={{ flex: 1 }}>
                        <div className="av3-truck-city">{t.city}</div>
                        <div className="av3-truck-meta">{t.open ? "open" : "closed"} · {t.onLine} on the line · {t.onShift} on shift</div>
                      </div>
                      <span className="mono" style={{ fontSize: 11.5, fontFamily: "var(--av3-mono)" }}>{zl(t.revenueToday)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* order flow */}
          <div className="av3-card">
            <div className="av3-card-head"><div className="av3-card-title">Order flow</div><span className="av3-card-desc">orders · last 60 min</span></div>
            <div className="av3-card-body">
              <div className="av3-flow">{flow.map((v, i) => <i key={i} style={{ height: `${(v / flowMax) * 100}%` }} />)}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 10.5, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>
                <span>−60m</span><span>peak {flowMax}/5m</span><span>now</span>
              </div>
            </div>
          </div>
        </div>

        {/* LIVE FEED */}
        <div className="av3-card av3-feedcard">
          <div className="av3-attn">
            <div className="av3-attn-head"><span className="av3-section-label" style={{ color: "var(--av3-warn)", marginBottom: 0 }}>Needs you now</span><span className="av3-badge av3-badge-warn">{needs.length}</span></div>
            {needs.length === 0 ? (
              <div className="av3-need"><span className="av3-need-d" style={{ background: "var(--av3-ok)" }} />All clear — nothing needs you.</div>
            ) : (
              needs.map((n, i) => (
                <div className="av3-need" key={i}>
                  <span className="av3-need-d" style={{ background: n.tone }} />
                  {n.text}
                  {n.action && <button type="button" className="av3-btn av3-btn-sm av3-need-act">{n.action}</button>}
                </div>
              ))
            )}
          </div>
          <div className="av3-feedscroll">
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0 4px" }}>
              <span className="av3-live-dot" aria-hidden /><span className="av3-section-label" style={{ marginBottom: 0 }}>Live feed</span>
            </div>
            {feed.length === 0 ? (
              <div className="av3-empty"><div className="av3-empty-text">No activity yet today.</div></div>
            ) : (
              <div className="av3-feed">
                {feed.map((n) => (
                  <div className="av3-fitem" key={n.id} data-tone={NOTIF_TONE[n.type] ?? "info"}>
                    <span className="av3-fitem-t">{relTime(n.createdAt)}</span>
                    <div className="av3-fitem-b">
                      <div className="av3-fitem-h">{n.title}</div>
                      <div className="av3-fitem-s">{n.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── lever sub-component ─────────────────────────────────────────────────────
function Lever({ label, value, delta, meter, color, tgt }: { label: string; value: string; delta?: number | null; meter: number; color: string; tgt: string }) {
  return (
    <div className="av3-lever">
      <div className="av3-lever-lab">
        {label}
        {delta != null && (
          <span className={`av3-delta ${delta >= 0 ? "av3-delta-up" : "av3-delta-down"}`}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="av3-lever-v">{value}</div>
      <div className="av3-lever-meter"><i style={{ width: `${Math.max(0, Math.min(100, meter))}%`, background: color }} /></div>
      <div className="av3-lever-tgt">{tgt}</div>
    </div>
  );
}
