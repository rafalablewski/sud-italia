import type { outboxEvents } from "@/db/schema";
import { logger } from "@/lib/logger";
import { getEmailProvider } from "@/lib/providers/email";
import { getSmsProvider } from "@/lib/providers/sms";
import { getCustomer, getOrderById } from "@/lib/store";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
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

function locationNameFor(slug: string): string {
  const hit = locations.find((l) => l.slug === slug);
  return hit?.name ?? slug;
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
} | null> {
  if (!payload.orderId || !payload.customerPhone) return null;
  const [customer, order] = await Promise.all([
    getCustomer(payload.customerPhone),
    getOrderById(payload.orderId),
  ]);
  if (!order) return null;
  if (!customer) {
    // No customer row yet — race with the createOrder rollup. Skip and
    // let the next drain pick it up.
    return null;
  }
  return { customer, order };
}

/**
 * Real dispatcher. Routes the event to the right template + provider.
 * Throws on send failure so drainOutbox retries the row.
 */
export async function commsDispatcher(event: OutboxRow): Promise<void> {
  const payload = (event.payload ?? {}) as OrderEventPayload;

  switch (event.eventType) {
    case "order.placed": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      if (ctx.customer.smsOptout) {
        logger.info("comms.skip.sms_optout", { eventId: event.id, type: event.eventType });
        return;
      }
      const sms = orderPlacedSms({
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
      if (ctx.customer.smsOptout) {
        logger.info("comms.skip.sms_optout", { eventId: event.id, type: event.eventType });
        return;
      }
      const sms = orderReadySms({
        orderId: ctx.order.id,
        customerName: ctx.customer.name || ctx.order.customerName || "Friend",
        fulfillmentType: ctx.order.fulfillmentType,
        locationName: locationNameFor(ctx.order.locationSlug),
      });
      await getSmsProvider().send(ctx.customer.phone, sms.body);
      return;
    }

    case "order.cancelled": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      if (ctx.customer.smsOptout) {
        logger.info("comms.skip.sms_optout", { eventId: event.id, type: event.eventType });
        return;
      }
      const sms = orderCancelledSms({
        orderId: ctx.order.id,
        customerName: ctx.customer.name || ctx.order.customerName || "Friend",
      });
      await getSmsProvider().send(ctx.customer.phone, sms.body);
      return;
    }

    case "order.refunded": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      const refund = ctx.order.refund;
      if (!refund) return; // race; will retry on the next drain
      if (!ctx.customer.smsOptout) {
        const sms = orderRefundedSms({
          orderId: ctx.order.id,
          customerName: ctx.customer.name || ctx.order.customerName || "Friend",
          amountDisplay: formatPrice(refund.amount),
          reasonLabel: refund.reasonCode,
        });
        await getSmsProvider().send(ctx.customer.phone, sms.body);
      }
      return;
    }

    case "order.confirmed": {
      const ctx = await loadContext(payload);
      if (!ctx) return;
      if (!ctx.customer.email || ctx.customer.emailOptout) return;
      const email = orderConfirmedReceiptEmail({
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
        locationName: locationNameFor(ctx.order.locationSlug),
      });
      await getEmailProvider().send({
        to: ctx.customer.email,
        subject: email.subject,
        text: email.text,
      });
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
