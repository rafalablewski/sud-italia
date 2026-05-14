import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getOrdersByPhone, listCorporateWallets } from "@/lib/store";
import { appendOutboxEvent } from "@/lib/outbox";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Auto-pre-order reminder cron (audit §3.4).
 *
 * Runs daily (or hourly when bumped to Pro). For every corporate with an
 * autoPreorderDay + autoPreorderTime configured, fires an SMS nudge to any
 * active member who hasn't yet placed an order today, IFF today matches
 * the configured day AND we're within `LEAD_HOURS` of the scheduled time.
 *
 * Body example:
 *   "Sud Italia — Acme Wednesday 12:30 lunch. 4/8 teammates ordered.
 *    Pick your meal: sudita.lia/corporate/acme"
 *
 * Dedupes per (slug, ISO date, phone) so retries within the same window
 * skip already-queued reminders.
 */
const LEAD_HOURS = 3;

export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const now = new Date();
  const today = now.getDay();
  const isoDate = now.toISOString().slice(0, 10);

  const corporates = await listCorporateWallets();

  const queued: { slug: string; phone: string }[] = [];
  const skipped: { slug: string; reason: string }[] = [];

  for (const w of corporates) {
    if (!w.corporate) continue;
    const c = w.corporate;
    if (typeof c.autoPreorderDay !== "number" || !c.autoPreorderTime) {
      skipped.push({ slug: c.slug, reason: "no schedule" });
      continue;
    }
    if (c.autoPreorderDay !== today) continue;

    const [hh, mm] = c.autoPreorderTime.split(":").map((n) => parseInt(n, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;

    const scheduled = new Date(now);
    scheduled.setHours(hh, mm, 0, 0);
    const hoursOut = (scheduled.getTime() - now.getTime()) / 3_600_000;
    if (hoursOut < 0 || hoursOut > LEAD_HOURS) continue;

    const activePhones = w.members
      .filter((m) => m.status === "active")
      .map((m) => m.phone);

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Per-phone indexed check (uses orders_customer_phone_idx) so we
    // don't scan the entire orders table once per corporate × member.
    const alreadyOrdered: string[] = [];
    const needNudge: string[] = [];
    for (const phone of activePhones) {
      const todays = await getOrdersByPhone(phone, {
        sinceIso: startOfDay.toISOString(),
      });
      if (todays.length > 0) alreadyOrdered.push(phone);
      else needNudge.push(phone);
    }

    for (const phone of needNudge) {
      await appendOutboxEvent({
        eventType: "corporate.preorder_reminder",
        entityType: "corporate",
        entityId: c.slug,
        dedupeKey: `${isoDate}:${phone}`,
        payload: {
          slug: c.slug,
          name: c.name,
          phone,
          dayName: DAY_NAMES[c.autoPreorderDay],
          time: c.autoPreorderTime,
          alreadyOrdered: alreadyOrdered.length,
          totalMembers: activePhones.length,
        },
      });
      queued.push({ slug: c.slug, phone });
    }
  }

  logCronRun("corporate-preorder-reminder", {
    ranAt: now.toISOString(),
    queued: queued.length,
    skipped: skipped.length,
  });
  return NextResponse.json({ ok: true, queued: queued.length, skipped });
}
