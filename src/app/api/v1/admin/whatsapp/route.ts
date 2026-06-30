import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getOrders, listWaSessions, listWaTranscriptHeads } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One merged conversation row — the native twin of web `mergeConversations`
 * (CoreInbox.tsx). A row is a historic transcript head, a live session, or both
 * (a live session overlays its cart / pending-payment state onto the head).
 */
interface ConversationRow {
  phone: string;
  lastAt: string;
  customerName: string | null;
  cartCount: number;
  cartSubtotalGrosze: number;
  fulfillmentType: string | null;
  pendingPaymentUrl: string | null;
  messageCount: number;
  lastBody: string;
  hasActiveSession: boolean;
}

/**
 * `GET /api/v1/admin/whatsapp` — the Guest → Inbox surface (mirrors
 * `/core/guest/inbox`). Returns the merged conversation list (live WhatsApp
 * sessions overlaid on historic transcripts) plus a lite metrics block, in one
 * call so the native Inbox renders without three round-trips. Staff+; chain-wide
 * (the WhatsApp channel is not location-partitioned — a session carries its own
 * `locationSlug`). All derived from existing stores, so there's no separate
 * counter to keep in sync (Rule #1).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  try {
    const [orders, sessions, heads] = await Promise.all([
      getOrders(),
      listWaSessions(),
      listWaTranscriptHeads(500),
    ]);

    // --- merge (mirror of web mergeConversations) ---
    const byPhone = new Map<string, ConversationRow>();
    for (const h of heads) {
      byPhone.set(h.phone, {
        phone: h.phone,
        lastAt: h.lastAt,
        customerName: null,
        cartCount: 0,
        cartSubtotalGrosze: 0,
        fulfillmentType: null,
        pendingPaymentUrl: null,
        messageCount: h.messageCount,
        lastBody: h.lastBody,
        hasActiveSession: false,
      });
    }
    for (const s of sessions) {
      const cartCount = s.cartItems.length;
      const cartSubtotalGrosze = s.cartItems.reduce(
        (sum, c) => sum + c.menuItem.price * c.quantity,
        0,
      );
      const ex = byPhone.get(s.phone);
      byPhone.set(s.phone, ex
        ? {
            ...ex,
            customerName: s.customerName ?? ex.customerName,
            hasActiveSession: true,
            cartCount,
            cartSubtotalGrosze,
            fulfillmentType: s.fulfillmentType,
            pendingPaymentUrl: s.pendingPaymentUrl,
          }
        : {
            phone: s.phone,
            lastAt: s.lastTurnAt,
            customerName: s.customerName,
            cartCount,
            cartSubtotalGrosze,
            fulfillmentType: s.fulfillmentType,
            pendingPaymentUrl: s.pendingPaymentUrl,
            messageCount: 0,
            lastBody: "",
            hasActiveSession: true,
          });
    }
    const conversations = [...byPhone.values()].sort(
      (a, b) => Date.parse(b.lastAt || "") - Date.parse(a.lastAt || ""),
    );

    // --- lite metrics (derived; staff-safe snapshot) ---
    const since7d = Date.now() - 7 * DAY_MS;
    const waOrders = orders.filter((o) => o.channel === "whatsapp");
    const paid7d = waOrders.filter(
      (o) => o.status !== "cancelled" && o.status !== "pending" && Date.parse(o.createdAt) >= since7d,
    ).length;
    const heads7d = heads.filter((h) => Date.parse(h.lastAt) >= since7d);
    const inbound7d = heads7d.length || 1;

    const metrics = {
      totalConversations: heads.length,
      activeSessions: sessions.length,
      awaitingPayment: sessions.filter((s) => !!s.pendingPaymentUrl).length,
      cartsWithItems: sessions.filter((s) => s.cartItems.length > 0).length,
      paidLast7d: paid7d,
      conversionRateLast7d: Math.min(1, paid7d / inbound7d),
    };

    return apiOk({ conversations, metrics }, { count: conversations.length });
  } catch (err) {
    logger.error("v1 admin whatsapp inbox failed", { layer: "api.v1.admin.whatsapp" }, err as Error);
    return apiError("internal", "Could not load the inbox");
  }
}
