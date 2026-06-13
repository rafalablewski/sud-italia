import { DEFAULT_OPERATIONS, getLaborCostInRange, getOrders, getSettings, getShifts } from "@/lib/store";
import { logger } from "@/lib/logger";

/** Operator-set labor productivity targets (admin → Operations). */
interface LaborTargets {
  coversPerStaffHour: number;
  splhLowGrosze: number;
  splhHighGrosze: number;
}

/**
 * Audit §2 "Scalability (ops)" + §10 #3 / §14 McDonald's-ops critique
 * ("Where's your sales-per-labor-hour metric? Where's your staff
 * schedule generated from demand forecast?").
 *
 * Two related metrics live here:
 *
 *   1. **Sales per labor hour (SPLH)** — yesterday's net revenue
 *      divided by yesterday's paired-punch hours per location. The
 *      industry benchmark for QSR is 90–140 PLN/hr (translates from
 *      ~$25–40/hr at current FX). Below ~70 PLN/hr is unprofitable;
 *      above ~150 PLN/hr is usually understaffed and a service-quality
 *      risk.
 *
 *   2. **Schedule-vs-sales gap** — for the *upcoming* day, compares
 *      the sum of scheduled-shift hours against the headcount the
 *      orders forecast implies. The forecast input is whatever the
 *      AI demand-forecast cron put in cache; falls back to last
 *      week's same-day orders × hours-per-cover (~3 covers/hr/staffer
 *      benchmark).
 *
 * Both are written to a daily kv_store snapshot
 * (`labor-efficiency-daily.json`) so the dashboard reads it instantly
 * rather than recomputing on every page load.
 */


export interface LocationLaborSnapshot {
  locationSlug: string;
  /** Yesterday's metrics (closed day, complete data). */
  yesterday: {
    date: string;
    revenueGrosze: number;
    laborGrosze: number;
    laborHours: number;
    orderCount: number;
    splhGrosze: number; // revenueGrosze / laborHours
    laborRatio: number | null;
    rating: "under" | "good" | "over"; // SPLH bucket
  };
  /** Today's projected gap. */
  today: {
    date: string;
    scheduledHours: number;
    impliedHoursNeeded: number;
    gapHours: number; // positive = overstaffed vs forecast
    forecastSource: "ai" | "trailing-week" | "none";
    forecastOrders: number;
  };
}

export interface LaborEfficiencyDaily {
  generatedAt: string;
  perLocation: LocationLaborSnapshot[];
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(`${yyyymmdd(now)}T00:00:00.000Z`);
}

/**
 * Yesterday's SPLH for one location. Splits hours from
 * `getLaborCostInRange` by multiplying labor cost back out — staff have
 * different hourly rates so this is a weighted average reconstruction.
 */
async function computeYesterday(
  locationSlug: string,
  targets: LaborTargets,
): Promise<LocationLaborSnapshot["yesterday"]> {
  const today = todayUtc();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const date = yyyymmdd(yesterday);
  const dayStart = yesterday;
  const dayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1);

  const allOrders = await getOrders(locationSlug);
  let revenueGrosze = 0;
  let orderCount = 0;
  for (const o of allOrders) {
    if (o.status === "pending" || o.status === "cancelled") continue;
    const day = o.slotDate || (o.paidAt || o.createdAt).slice(0, 10);
    if (day !== date) continue;
    revenueGrosze += o.totalAmount;
    orderCount++;
  }

  // Gemini review on PR #38 caught a precision bug here: we were
  // reconstructing hours as `laborGrosze / avgRate` which is wrong when
  // staff have different rates. Use the actual paired-punch hours that
  // `getLaborCostInRange` now returns alongside the cost.
  const { laborGrosze, laborHours } = await getLaborCostInRange(
    locationSlug,
    dayStart.toISOString(),
    dayEnd.toISOString(),
    dayEnd,
  );

  const splhGrosze =
    laborHours > 0 ? Math.round(revenueGrosze / laborHours) : 0;
  const rating: LocationLaborSnapshot["yesterday"]["rating"] =
    splhGrosze < targets.splhLowGrosze
      ? "under"
      : splhGrosze > targets.splhHighGrosze
        ? "over"
        : "good";

  return {
    date,
    revenueGrosze,
    laborGrosze,
    laborHours,
    orderCount,
    splhGrosze,
    laborRatio: revenueGrosze > 0 ? Math.round((laborGrosze / revenueGrosze) * 1000) / 1000 : null,
    rating,
  };
}

/**
 * Pulls a same-day forecast either from the AI demand cron cache or
 * from the trailing-week baseline. The trailing-week baseline is
 * "orders 7 days ago on the same weekday" — biased high during a
 * growth phase, low during a slowdown, but the right zero-effort
 * starting point.
 */
async function readForecastForToday(
  locationSlug: string,
): Promise<{ orders: number; source: "ai" | "trailing-week" | "none" }> {
  // Try AI forecast cache first (per audit §0.1: Claude-backed forecast
  // lives at /api/admin/ai/forecast and caches per-location in
  // kv_store["ai-forecast-${slug}.json"]). Dynamic import so a missing
  // AI lib doesn't break the cron.
  try {
    const { getCacheJson } = await import("@/lib/store");
    const cached = await getCacheJson<{
      result?: { days?: { date: string; predictedOrders: number }[]; source?: string };
    } | null>(`ai-forecast-${locationSlug}.json`, null);
    const days = cached?.result?.days ?? [];
    const today = yyyymmdd(new Date());
    const todaySlot = days.find((d) => d.date === today) ?? days[0];
    if (todaySlot && typeof todaySlot.predictedOrders === "number" && todaySlot.predictedOrders > 0) {
      return {
        orders: Math.round(todaySlot.predictedOrders),
        source: cached?.result?.source === "claude" ? "ai" : "trailing-week",
      };
    }
  } catch {
    // Fall through to baseline.
  }

  // Baseline: orders 7 days ago, same UTC date.
  const sevenDaysAgo = yyyymmdd(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const allOrders = await getOrders(locationSlug);
  let count = 0;
  for (const o of allOrders) {
    if (o.status === "pending" || o.status === "cancelled") continue;
    const day = o.slotDate || (o.paidAt || o.createdAt).slice(0, 10);
    if (day === sevenDaysAgo) count++;
  }
  return { orders: count, source: count > 0 ? "trailing-week" : "none" };
}

async function computeToday(
  locationSlug: string,
  targets: LaborTargets,
): Promise<LocationLaborSnapshot["today"]> {
  const today = todayUtc();
  const date = yyyymmdd(today);

  // Scheduled hours = sum of shift durations starting today.
  const shifts = await getShifts({
    locationSlug,
    from: today.toISOString(),
    to: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });
  const scheduledHours = shifts.reduce((sum, s) => {
    const start = new Date(s.startAt).getTime();
    const end = new Date(s.endAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    return sum + (end - start) / 3600000;
  }, 0);

  const { orders: forecastOrders, source: forecastSource } =
    await readForecastForToday(locationSlug);

  // Demand → hours conversion. Operating hours assumed ~10/day; covers
  // distributed roughly through them. Overstates hours-needed if rush
  // is concentrated; underestimates if multiple stations need parallel
  // staffing. Good enough as a first signal.
  const impliedHoursNeeded =
    forecastOrders > 0
      ? Math.ceil(forecastOrders / targets.coversPerStaffHour)
      : 0;

  return {
    date,
    scheduledHours: Math.round(scheduledHours * 100) / 100,
    impliedHoursNeeded,
    gapHours: Math.round((scheduledHours - impliedHoursNeeded) * 100) / 100,
    forecastSource,
    forecastOrders,
  };
}

export async function computeLaborEfficiencyDaily(): Promise<LaborEfficiencyDaily> {
  const { getActiveLocationsAsync } = await import("@/lib/locations-store");
  const [locations, settings] = await Promise.all([
    getActiveLocationsAsync(),
    getSettings(),
  ]);
  const lab = settings.operations?.labor;
  const targets: LaborTargets = {
    coversPerStaffHour: lab?.coversPerStaffHour ?? DEFAULT_OPERATIONS.labor.coversPerStaffHour,
    splhLowGrosze: lab?.splhLowGrosze ?? DEFAULT_OPERATIONS.labor.splhLowGrosze,
    splhHighGrosze: lab?.splhHighGrosze ?? DEFAULT_OPERATIONS.labor.splhHighGrosze,
  };
  const perLocation: LocationLaborSnapshot[] = [];
  for (const loc of locations) {
    try {
      const [yesterday, today] = await Promise.all([
        computeYesterday(loc.slug, targets),
        computeToday(loc.slug, targets),
      ]);
      perLocation.push({ locationSlug: loc.slug, yesterday, today });
    } catch (err) {
      logger.warn(
        "labor-efficiency: location compute failed",
        { locationSlug: loc.slug, layer: "labor-efficiency" },
        err,
      );
    }
  }
  return { generatedAt: new Date().toISOString(), perLocation };
}
