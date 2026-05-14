import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getOrdersByPhone, listCorporateWallets } from "@/lib/store";
import { appendOutboxEvent } from "@/lib/outbox";

/**
 * Monthly corporate invoice cron (audit §3.4).
 *
 * Runs on the 1st of each month via the daily dispatcher. For every
 * corporate-configured wallet with a billingEmail set:
 *   1. Sums each active member's previous-month orders.
 *   2. Builds a per-employee breakdown (phone, order count, total).
 *   3. Queues a `corporate.monthly_invoice` outbox event so the comms
 *      dispatcher emails the billing contact (Mailgun when configured;
 *      noop otherwise).
 *
 * Dedupes per (slug, period) so a retry within the same month is a no-op.
 * No body is generated when a corporate has zero billed orders — empty
 * months don't need an invoice.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const now = new Date();
  // Period = the calendar month that just ended.
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);

  const corporates = await listCorporateWallets();

  const results: { slug: string; lineCount: number; totalGrosze: number; queued: boolean }[] = [];

  for (const w of corporates) {
    if (!w.corporate || !w.corporate.billingEmail) continue;

    const activePhones = w.members
      .filter((m) => m.status === "active")
      .map((m) => m.phone);

    const lines: { phone: string; ordersCount: number; totalGrosze: number }[] = [];
    let totalGrosze = 0;

    for (const phone of activePhones) {
      // Indexed per-phone query bounded by period; faster than scanning
      // the full orders table for every corporate × every member.
      const sinceIso = periodStart.toISOString();
      const allSince = await getOrdersByPhone(phone, { sinceIso });
      const mine = allSince.filter((o) => new Date(o.createdAt) < periodEnd);
      if (mine.length === 0) continue;
      const sub = mine.reduce((s, o) => s + o.totalAmount, 0);
      lines.push({ phone, ordersCount: mine.length, totalGrosze: sub });
      totalGrosze += sub;
    }

    if (lines.length === 0) {
      results.push({ slug: w.corporate.slug, lineCount: 0, totalGrosze: 0, queued: false });
      continue;
    }

    await appendOutboxEvent({
      eventType: "corporate.monthly_invoice",
      entityType: "corporate",
      entityId: w.corporate.slug,
      dedupeKey: periodStart.toISOString().slice(0, 7),
      payload: {
        slug: w.corporate.slug,
        name: w.corporate.name,
        billingEmail: w.corporate.billingEmail,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalGrosze,
        lines,
      },
    });

    results.push({ slug: w.corporate.slug, lineCount: lines.length, totalGrosze, queued: true });
  }

  logCronRun("corporate-invoices", { ranAt: now.toISOString(), results });
  return NextResponse.json({ ok: true, results });
}
