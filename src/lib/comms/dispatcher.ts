import type { outboxEvents } from "@/db/schema";
import { logger } from "@/lib/logger";
import { getEmailProvider } from "@/lib/providers/email";
import { getSmsProvider } from "@/lib/providers/sms";
import { getWhatsAppProvider } from "@/lib/providers/whatsapp";
import { getCustomer, getOrderById, getSettings, isTestModeActive } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { SITE_NAME } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { pushToCustomer, PUSH_TEMPLATES } from "@/lib/push-notifications";
import {
  orderCancelledSms,
  orderConfirmedReceiptEmail,
  orderPlacedSms,
  orderReadySms,
  orderRefundedSms,
} from "@/lib/comms/templates";

/**
 * Outbox → templates → providers dispatcher (m2_17). Replaces the
 * stub defaultDispatch in lib/outbox.ts for events that customers care
 * about. The /api/admin/cron/outbox-drain route passes this in when
 * comms is enabled.
 *
 * Opt-out checks: every customer row has sms_optout / email_optout
 * (m1_4); the dispatcher reads them and skips the send when set. The
 * outbox row still gets marked processed — opt-out is a "send-skip"
 * not a "send-fail", so we don't retry it later.
 *
 * Locale: hardcoded to PL for now (chain operates in Poland). When
 * Phase 4 m4_17 adds customer.locale we'll thread it through.
 */

type OutboxRow = typeof outboxEvents.$inferSelect;

async function locationNameFor(slug: string): Promise<string> {
  const list = await getActiveLocationsAsync();
  return list.find((l) => l.slug === slug)?.name ?? slug;
}

interface OrderEventPayload {
  orderId?: string;
  locationSlug?: string;
  customerPhone?: string;
  status?: string;
  totalAmount?: number;
  customerName?: string;
  paidAt?: string;
  refund?: { amount: number; reasonCode: string };
}

/**
 * Pulls together the joinable context the templates need: the customer
 * row (for opt-out + name) and the order (for the line items, slot,
 * total). Returns null if either lookup fails — better to skip than to
 * fire an under-rendered message to the customer.
 */
async function loadContext(payload: OrderEventPayload): Promise<{
  customer: NonNullable<Awaited<ReturnType<typeof getCustomer>>>;
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>;
  /** Operator trading name for the message templates (admin-set, single
   *  source). Falls back to SITE_NAME on a fresh install. */
  brand: string;
} | null> {
  if (!payload.orderId || !payload.customerPhone) return null;
  const [customer, order, settings] = await Promise.all([
    getCustomer(payload.customerPhone),
    getOrderById(payload.orderId),
    getSettings(),
  ]);
  if (!order) return null;
  if (!customer) {
    // No customer row yet — race with the createOrder rollup. Skip and
    // let the next drain pick it up.
    return null;
  }
  return { customer, order, brand: settings.businessName || SITE_NAME };
}

/**
 * Real dispatcher. Routes the event to the right template + provider.
 * Throws on send failure so drainOutbox retries the row.
 */
export async function commsDispatcher(event: OutboxRow): Promise<void> {
  // Simulation mode: never send real SMS / email / WhatsApp / push for test data.
  if (await isTestModeActive()) {
    logger.info("comms.skip.simulation", { eventType: event.eventType });
    return;
  }
  const payload = (event.payload ?? {}) as OrderEventPayload;

  switch (event.eventType) {
    case "order.placed": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      // WhatsApp orders: the bot already sent the customer a "Pay now"
      // button as the same flow that created the order. A duplicate SMS
      // would be noise.
      if (ctx.order.channel === "whatsapp") {
        logger.info("comms.skip.whatsapp_already_notified", { eventId: event.id });
        return;
      }
      if (ctx.customer.smsOptout) {
        logger.info("comms.skip.sms_optout", { eventId: event.id, type: event.eventType });
        return;
      }
      const sms = orderPlacedSms({
        brand: ctx.brand,
        orderId: ctx.order.id,
        customerName: ctx.customer.name || ctx.order.customerName || "Friend",
        totalDisplay: formatPrice(ctx.order.totalAmount),
        slotDisplay: ctx.order.slotTime,
        fulfillmentType: ctx.order.fulfillmentType,
      });
      await getSmsProvider().send(ctx.customer.phone, sms.body);
      return;
    }

    case "order.ready": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      // Web push runs alongside SMS — opt-out is per-channel. A
      // customer who opted out of SMS may still want a push that the
      // pizza is on the pass; a customer with no push subscription
      // gets zero noise (pushToCustomer no-ops when there are no
      // rows).
      try {
        await pushToCustomer(
          ctx.customer.phone,
          PUSH_TEMPLATES.orderReady(ctx.order.id),
        );
      } catch (err) {
        logger.warn(
          "comms.push.send_failed",
          { eventId: event.id, phone: ctx.customer.phone },
          err,
        );
      }
      if (ctx.customer.smsOptout) {
        logger.info("comms.skip.sms_optout", { eventId: event.id, type: event.eventType });
        return;
      }
      const body = orderReadySms({
        brand: ctx.brand,
        orderId: ctx.order.id,
        customerName: ctx.customer.name || ctx.order.customerName || "Friend",
        fulfillmentType: ctx.order.fulfillmentType,
        locationName: await locationNameFor(ctx.order.locationSlug),
      }).body;
      if (ctx.order.channel === "whatsapp") {
        await getWhatsAppProvider().sendText(ctx.customer.phone, body);
      } else {
        await getSmsProvider().send(ctx.customer.phone, body);
      }
      return;
    }

    case "order.cancelled": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      if (ctx.customer.smsOptout) {
        logger.info("comms.skip.sms_optout", { eventId: event.id, type: event.eventType });
        return;
      }
      const body = orderCancelledSms({
        brand: ctx.brand,
        orderId: ctx.order.id,
        customerName: ctx.customer.name || ctx.order.customerName || "Friend",
      }).body;
      if (ctx.order.channel === "whatsapp") {
        await getWhatsAppProvider().sendText(ctx.customer.phone, body);
      } else {
        await getSmsProvider().send(ctx.customer.phone, body);
      }
      return;
    }

    case "order.refunded": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      const refund = ctx.order.refund;
      if (!refund) return; // race; will retry on the next drain
      if (!ctx.customer.smsOptout) {
        const body = orderRefundedSms({
          brand: ctx.brand,
          orderId: ctx.order.id,
          customerName: ctx.customer.name || ctx.order.customerName || "Friend",
          amountDisplay: formatPrice(refund.amount),
          reasonLabel: refund.reasonCode,
        }).body;
        if (ctx.order.channel === "whatsapp") {
          await getWhatsAppProvider().sendText(ctx.customer.phone, body);
        } else {
          await getSmsProvider().send(ctx.customer.phone, body);
        }
      }
      return;
    }

    case "order.confirmed": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      // WhatsApp-channel orders get an immediate chat confirmation —
      // the customer is in an active conversation and expects a reply.
      if (ctx.order.channel === "whatsapp" && !ctx.customer.smsOptout) {
        const slotLabel = `${ctx.order.slotDate} ${ctx.order.slotTime}`;
        const message =
          ctx.order.fulfillmentType === "delivery"
            ? `Płatność odebrana ✅ Zamówienie #${ctx.order.id} jedzie do Ciebie na ${slotLabel}. Grazie! 🍕`
            : `Płatność odebrana ✅ Zamówienie #${ctx.order.id} będzie gotowe do odbioru na ${slotLabel} (${await locationNameFor(ctx.order.locationSlug)}). Smacznego! 🍕`;
        await getWhatsAppProvider().sendText(ctx.customer.phone, message);
      }
      if (!ctx.customer.email || ctx.customer.emailOptout) return;
      // Referral CTA in the receipt footer. Uses NEXT_PUBLIC_BASE_URL +
      // the customer's phone as the unique handle — the existing referral
      // landing page already accepts ?ref=<phone>.
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
      const referralUrl = baseUrl
        ? `${baseUrl}/?ref=${encodeURIComponent(ctx.customer.phone)}`
        : undefined;
      const email = orderConfirmedReceiptEmail({
        brand: ctx.brand,
        orderId: ctx.order.id,
        customerName: ctx.customer.name || ctx.order.customerName || "Friend",
        totalDisplay: formatPrice(ctx.order.totalAmount),
        itemLines: ctx.order.items.map((i) => ({
          name: i.menuItem.name,
          qty: i.quantity,
          lineTotal: formatPrice(i.menuItem.price * i.quantity),
        })),
        // 1 PLN spent = 1 point earned (matches the existing loyalty math).
        pointsEarned: Math.floor(ctx.order.totalAmount / 100),
        slotDisplay: ctx.order.slotTime,
        locationName: await locationNameFor(ctx.order.locationSlug),
        referralUrl,
      });
      await getEmailProvider().send({
        to: ctx.customer.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return;
    }

    // --- Ottaviano Corporate (audit §3.4) ----------------------------
    // Monthly VAT-compliant invoice to the corporate billing email.
    // Payload: { slug, name, billingEmail, periodStart, periodEnd,
    //            totalGrosze, lines: [{ phone, ordersCount, totalGrosze }] }
    case "corporate.monthly_invoice": {
      const p = event.payload as {
        name?: string;
        slug?: string;
        billingEmail?: string;
        periodStart?: string;
        periodEnd?: string;
        totalGrosze?: number;
        lines?: { phone: string; ordersCount: number; totalGrosze: number }[];
      };
      if (!p.billingEmail || !p.slug || !p.name) {
        logger.warn("comms.corporate_invoice.missing_fields", { eventId: event.id });
        return;
      }
      const periodLabel =
        p.periodStart && p.periodEnd
          ? `${p.periodStart.slice(0, 10)} → ${p.periodEnd.slice(0, 10)}`
          : "";
      const lines = (p.lines ?? [])
        .map(
          (l) =>
            `<tr><td>${l.phone}</td><td>${l.ordersCount}</td><td style="text-align:right">${formatPrice(l.totalGrosze)}</td></tr>`,
        )
        .join("");
      const subject = `Ottaviano Corporate — invoice for ${p.name} (${periodLabel})`;
      const html = `
        <h2 style="font-family: Georgia, serif;">Ottaviano Corporate</h2>
        <p>Monthly billing summary for <strong>${p.name}</strong> (${periodLabel}).</p>
        <table style="border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif;">
          <thead><tr><th>Employee</th><th>Orders</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${lines}</tbody>
        </table>
        <p style="margin-top: 16px; font-weight: 600;">Total: ${formatPrice(p.totalGrosze ?? 0)}</p>
        <p style="margin-top: 12px; font-size: 12px; color: #6b7280;">
          VAT-compliant invoice attached separately by your accountant. This message confirms the captured period.
        </p>`;
      const text = [
        `Ottaviano Corporate — monthly invoice for ${p.name}`,
        periodLabel,
        ...(p.lines ?? []).map(
          (l) => `${l.phone}: ${l.ordersCount} orders · ${formatPrice(l.totalGrosze)}`,
        ),
        `Total: ${formatPrice(p.totalGrosze ?? 0)}`,
      ].join("\n");
      await getEmailProvider().send({
        to: p.billingEmail,
        subject,
        text,
        html,
      });
      return;
    }

    // Auto-pre-order reminder — fires ~2h before the corporate's standing
    // weekly slot for each member who hasn't yet placed an order today.
    // Payload: { slug, name, phone, dayName, time, alreadyOrdered, totalMembers }
    case "corporate.preorder_reminder": {
      const p = event.payload as {
        name?: string;
        phone?: string;
        dayName?: string;
        time?: string;
        alreadyOrdered?: number;
        totalMembers?: number;
      };
      if (!p.phone || !p.name) {
        logger.warn("comms.corporate_reminder.missing_fields", { eventId: event.id });
        return;
      }
      const customer = await getCustomer(p.phone);
      if (customer?.smsOptout) {
        logger.info("comms.skip.sms_optout", {
          eventId: event.id,
          type: event.eventType,
        });
        return;
      }
      const dayLabel = p.dayName ? `${p.dayName} ${p.time ?? ""}` : "today's";
      const body = `Ottaviano — ${p.name} ${dayLabel} lunch. ${p.alreadyOrdered ?? 0}/${p.totalMembers ?? 0} teammates ordered. Pick your meal: ottaviano.pl/corporate/${(event.payload as { slug?: string }).slug ?? ""}`.slice(0, 300);
      await getSmsProvider().send(p.phone, body);
      return;
    }

    // Referral give-get qualified — the referee just completed their
    // first paid order. Credit the referrer's loyalty points + SMS them
    // the win. Idempotency comes from the outbox dedupe on redemption id.
    case "referral.qualified": {
      const p = event.payload as {
        code?: string;
        ownerPhone?: string;
        ownerName?: string;
        refereePhone?: string;
        rewardPoints?: number;
      };
      if (!p.ownerPhone || !p.rewardPoints) {
        logger.warn("comms.referral.missing_fields", { eventId: event.id });
        return;
      }
      const { addPointAdjustment } = await import("@/lib/store");
      await addPointAdjustment({
        phone: p.ownerPhone,
        amount: p.rewardPoints,
        reason: `Referral reward (code ${p.code ?? "?"})`,
        adjustedBy: "system:referral",
        adjustedAt: new Date().toISOString(),
      });
      const owner = await getCustomer(p.ownerPhone);
      if (!owner || owner.smsOptout) {
        logger.info("comms.skip.sms_optout", {
          eventId: event.id,
          type: event.eventType,
        });
        return;
      }
      const body = `Ottaviano — Grazie! Your friend's first order landed. ${p.rewardPoints} points (~${(p.rewardPoints / 10).toFixed(0)} zł) just hit your wallet. Buon appetito!`.slice(0, 300);
      await getSmsProvider().send(p.ownerPhone, body);
      return;
    }

    default:
      // Unknown event type — let it pass through, but log so an operator
      // notices if we ship a new event without wiring its handler.
      logger.warn("comms.unknown_event_type", {
        eventId: event.id,
        type: event.eventType,
      });
      return;
  }
}
