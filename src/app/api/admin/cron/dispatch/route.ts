import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { logger } from "@/lib/logger";

/**
 * Single-cron fan-out dispatcher. Vercel Hobby caps the deployment
 * at 2 cron entries, each daily-only — far below the 8 jobs we've
 * shipped. This route runs once a day at 04:00 UTC and internally
 * fires whichever sibling jobs should run today based on the UTC
 * calendar.
 *
 *   - outbox-drain               daily here (Pro: every minute)
 *   - slots-auto-close           daily here (Pro: every 5 min)
 *   - daily-summary              daily
 *   - customers-lapsed-detect    daily
 *   - weather-staffing           daily
 *   - inventory-variance         Sundays only
 *   - loyalty-expire-points      first of month only
 *   - royalty-weekly             Mondays only
 *
 * Each sibling is POSTed with the same CRON_SECRET header — they
 * keep their own auth gate via withCron(), independent of this
 * fan-out, so they remain manually triggerable for testing.
 *
 * When the project upgrades to Vercel Pro, switch back to the
 * per-job schedule by editing vercel.json — the sibling routes
 * have no dispatcher-specific code so the move is free.
 */

const ALL_JOBS = [
  { path: "/api/admin/cron/outbox-drain", everyDay: true },
  { path: "/api/admin/cron/slots-auto-close", everyDay: true },
  { path: "/api/admin/cron/daily-summary", everyDay: true },
  { path: "/api/admin/cron/customers-lapsed-detect", everyDay: true },
  { path: "/api/admin/cron/weather-staffing", everyDay: true },
  // Audit §3.4 — corporate auto-pre-order reminders fire daily and self-
  // skip when no corporate has a schedule matching today within the
  // lead window.
  { path: "/api/admin/cron/corporate-preorder-reminder", everyDay: true },
  { path: "/api/admin/cron/inventory-variance", everyDay: false, dow: 0 },
  { path: "/api/admin/cron/loyalty-expire-points", everyDay: false, dom: 1 },
  // Audit §3.4 — monthly corporate invoice on the 1st of each month.
  { path: "/api/admin/cron/corporate-invoices", everyDay: false, dom: 1 },
  { path: "/api/admin/cron/royalty-weekly", everyDay: false, dow: 1 },
] as const;

function shouldRun(
  job: (typeof ALL_JOBS)[number],
  now: Date,
): boolean {
  if (job.everyDay) return true;
  if ("dow" in job && job.dow !== undefined && now.getUTCDay() !== job.dow) return false;
  if ("dom" in job && job.dom !== undefined && now.getUTCDate() !== job.dom) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const now = new Date();
  const origin = req.nextUrl.origin;
  const secret = process.env.CRON_SECRET ?? "";
  const headers: HeadersInit = secret
    ? { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  const results: { path: string; status: number; ok: boolean; error?: string }[] = [];
  for (const job of ALL_JOBS) {
    if (!shouldRun(job, now)) {
      results.push({ path: job.path, status: 0, ok: true });
      continue;
    }
    try {
      const res = await fetch(`${origin}${job.path}`, { method: "POST", headers });
      results.push({ path: job.path, status: res.status, ok: res.ok });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.error("cron.dispatch.child_failed", {
          layer: "cron.dispatch",
          path: job.path,
          status: res.status,
          bodyPreview: body.slice(0, 300),
        });
      }
    } catch (err) {
      results.push({
        path: job.path,
        status: 0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      logger.error("cron.dispatch.child_exception", { layer: "cron.dispatch", path: job.path }, err);
    }
  }

  logCronRun("dispatch", { results, ranAt: now.toISOString() });
  return NextResponse.json({ ok: true, results });
}
