import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getOrders,
  listWaSessions,
  listWaTranscriptHeads,
} from "@/lib/store";
import type { Order } from "@/data/types";

/**
 * Snapshot metrics for the WhatsApp channel. Derives everything from
 * existing stores so there's no separate counter to keep in sync —
 * transcripts give us inbound activity, orders give us conversions
 * filtered by channel, sessions give us live funnel snapshots.
 *
 * The "funnel" here is a coarse approximation. A precise one would
 * require event-level instrumentation; for an operator dashboard the
 * stage-of-current-session view is good enough.
 */

interface Funnel {
  totalSessions: number;
  locationSet: number;
  cartHasItems: number;
  fulfillmentSet: number;
  slotPicked: number;
  awaitingPayment: number;
}

interface OrdersWindow {
  count: number;
  paid: number;
  cancelled: number;
  pending: number;
  revenueGrosze: number;
  averageGrosze: number;
}

interface ActivityWindow {
  inboundMessages: number;
  outboundMessages: number;
  uniquePhones: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function orderInWindow(o: Order, since: number): boolean {
  const t = Date.parse(o.createdAt);
  return Number.isFinite(t) && t >= since;
}

function summarizeOrders(orders: Order[]): OrdersWindow {
  let paid = 0;
  let cancelled = 0;
  let pending = 0;
  let revenue = 0;
  for (const o of orders) {
    if (o.status === "cancelled") cancelled++;
    else if (o.status === "pending") pending++;
    else {
      paid++;
      revenue += o.totalAmount;
    }
  }
  return {
    count: orders.length,
    paid,
    cancelled,
    pending,
    revenueGrosze: revenue,
    averageGrosze: paid > 0 ? Math.round(revenue / paid) : 0,
  };
}

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async () => {
    const now = Date.now();
    const since7d = now - 7 * DAY_MS;
    const since30d = now - 30 * DAY_MS;

    const [allOrders, sessions, heads] = await Promise.all([
      getOrders(),
      listWaSessions(),
      listWaTranscriptHeads(500),
    ]);

    const waOrders = allOrders.filter((o) => o.channel === "whatsapp");
    const orders7d = waOrders.filter((o) => orderInWindow(o, since7d));
    const orders30d = waOrders.filter((o) => orderInWindow(o, since30d));

    const funnel: Funnel = {
      totalSessions: sessions.length,
      locationSet: sessions.filter((s) => !!s.locationSlug).length,
      cartHasItems: sessions.filter((s) => s.cartItems.length > 0).length,
      fulfillmentSet: sessions.filter((s) => !!s.fulfillmentType).length,
      slotPicked: sessions.filter((s) => !!s.slotId).length,
      awaitingPayment: sessions.filter((s) => !!s.pendingPaymentUrl).length,
    };

    // Activity is harder to bucket from the head list (we don't have
    // per-message timestamps without re-reading every transcript).
    // For a coarse cut, use the head row's lastAt + messageCount and
    // window on lastAt; this is an upper bound on activity in the window.
    const heads7d = heads.filter((h) => Date.parse(h.lastAt) >= since7d);
    const activity7d: ActivityWindow = {
      inboundMessages: heads7d.filter((h) => h.hasInbound).length,
      outboundMessages: heads7d.reduce((s, h) => s + h.messageCount, 0),
      uniquePhones: heads7d.length,
    };

    // Conversion approximation: orders created from WhatsApp ÷ phones with
    // any inbound message in the same window. Caps at 100% so noise from
    // multi-order phones doesn't produce a misleading number.
    const inbound7d = activity7d.uniquePhones || 1;
    const conversionRate = Math.min(1, orders7d.length / inbound7d);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      windows: {
        last7d: {
          orders: summarizeOrders(orders7d),
          activity: activity7d,
          conversionRate,
        },
        last30d: {
          orders: summarizeOrders(orders30d),
        },
        lifetime: {
          orders: summarizeOrders(waOrders),
        },
      },
      activeSessions: funnel,
      historicConversations: heads.length,
    });
  },
);
