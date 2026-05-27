import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import {
  getWaSettings,
  listWaAbandonedCarts,
  markWaAbandonedCartNotified,
} from "@/lib/store";
import { getWhatsAppProviderAs } from "@/lib/providers/whatsapp";
import { logger } from "@/lib/logger";

/**
 * Abandoned-cart recovery. Runs from the daily dispatcher. Sends the Meta
 * re-open template (the only message type allowed once the 24h window has
 * closed) to customers who built a WhatsApp cart but didn't pay — once each,
 * after `delayHours` and before the recovery window closes. Opt-in via
 * settings.abandonedCart.enabled and requires a configured reopenTemplate.
 */

const HOUR_MS = 60 * 60 * 1000;
// Don't chase carts older than this — a 4-day-old cart is cold, and the menu /
// prices may have moved on.
const MAX_AGE_HOURS = 96;
// Cap sends per run so a backlog can't blast the whole base in one cron tick.
const MAX_PER_RUN = 200;

export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const settings = await getWaSettings();
  if (!settings.enabled || !settings.abandonedCart?.enabled) {
    logCronRun("whatsapp-abandoned-cart", { skipped: "disabled" });
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  const template = settings.reopenTemplate?.trim();
  if (!template) {
    logCronRun("whatsapp-abandoned-cart", { skipped: "no-template" });
    return NextResponse.json({ ok: true, skipped: "no reopen template configured" });
  }

  const delayMs = Math.max(0, settings.abandonedCart.delayHours) * HOUR_MS;
  const now = Date.now();
  const carts = await listWaAbandonedCarts();

  const eligible = carts.filter((c) => {
    if (c.notifiedAt) return false;
    const t = Date.parse(c.lastCartAt);
    if (!Number.isFinite(t)) return false;
    const age = now - t;
    return age >= delayMs && age <= MAX_AGE_HOURS * HOUR_MS;
  });

  const provider = getWhatsAppProviderAs("system");
  let sent = 0;
  let failed = 0;
  for (const cart of eligible.slice(0, MAX_PER_RUN)) {
    try {
      await provider.sendTemplate(cart.phone, template, "pl");
      await markWaAbandonedCartNotified(cart.phone);
      sent++;
    } catch (err) {
      failed++;
      logger.warn(
        "whatsapp-abandoned-cart send failed",
        { phone: cart.phone, layer: "cron" },
        err,
      );
    }
  }

  logCronRun("whatsapp-abandoned-cart", {
    template,
    totalRecords: carts.length,
    eligible: eligible.length,
    sent,
    failed,
  });

  return NextResponse.json({
    ok: true,
    totalRecords: carts.length,
    eligible: eligible.length,
    sent,
    failed,
  });
}
