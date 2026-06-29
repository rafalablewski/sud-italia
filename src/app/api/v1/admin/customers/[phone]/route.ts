import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopedLocations } from "@/lib/api/v1/guard";
import {
  getCustomerNotes, getLoyaltyMember, getOrders, getPointAdjustments, getWalletRedemptions,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/customers/:phone` — single-customer CRM detail: loyalty
 * member, recent orders, lifetime totals, points (earned + manual − redeemed),
 * and notes. Mirrors web `/api/admin/customers/[phone]`. Staff+; a scoped
 * operator's totals/orders are filtered to their authorized locations (so a
 * Kraków-only operator can't read a guest's Warszawa lifetime value).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  const { phone: raw } = await ctx.params;
  const phone = decodeURIComponent(raw);
  const canonical = normalizePlPhoneE164(phone) ?? phone;
  const allowed = scopedLocations(guard.claims.scope); // null = unrestricted

  try {
    const [orders, member, adjustments, redemptions, notes] = await Promise.all([
      getOrders(),
      getLoyaltyMember(canonical),
      getPointAdjustments(),
      getWalletRedemptions(),
      getCustomerNotes(canonical),
    ]);

    const myOrders = orders
      .filter((o) =>
        o.customerPhone && phonesEqualPl(o.customerPhone, canonical) &&
        o.status !== "pending" && (allowed === null || allowed.includes(o.locationSlug)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totalSpent = myOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    const myAdjustments = adjustments.filter((a) => phonesEqualPl(a.phone, canonical));
    const manualPoints = myAdjustments.reduce((acc, a) => acc + a.amount, 0);
    const earnedPoints = Math.floor(totalSpent / 100);
    const redeemedPoints = redemptions
      .filter((r) => phonesEqualPl(r.phone, canonical))
      .reduce((acc, r) => acc + r.points, 0);

    return apiOk({
      phone: canonical,
      name: member ? [member.name, member.lastName].filter(Boolean).join(" ") : (myOrders[0]?.customerName ?? null),
      member: member ?? null,
      orders: myOrders.slice(0, 20).map((o) => ({
        id: o.id, createdAt: o.createdAt, status: o.status, totalAmount: o.totalAmount,
        itemCount: o.items.reduce((acc, ci) => acc + ci.quantity, 0),
        locationSlug: o.locationSlug, fulfillmentType: o.fulfillmentType, channel: o.channel ?? "web",
      })),
      totals: {
        totalSpent,
        orderCount: myOrders.length,
        avgOrderValue: myOrders.length > 0 ? Math.round(totalSpent / myOrders.length) : 0,
        lastOrderAt: myOrders[0]?.createdAt ?? null,
        firstOrderAt: myOrders[myOrders.length - 1]?.createdAt ?? null,
        channels: Array.from(new Set(myOrders.map((o) => o.fulfillmentType))),
        locations: Array.from(new Set(myOrders.map((o) => o.locationSlug))),
        earnedPoints, manualPoints, redeemedPoints,
        spendablePoints: Math.max(0, earnedPoints + manualPoints - redeemedPoints),
      },
      notes: notes.map((n) => ({ id: n.id, body: n.body, tags: n.tags ?? [], authoredBy: n.authoredBy ?? null, createdAt: n.createdAt })),
    });
  } catch (err) {
    logger.error("v1 customer detail failed", { layer: "api.v1.admin.customers.detail" }, err as Error);
    return apiError("internal", "Could not load the customer");
  }
}
