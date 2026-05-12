import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  getCustomerNotes,
  getLoyaltyMember,
  getOrders,
  getPointAdjustments,
  getWalletRedemptions,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const auth = await requireAuth();
  if (auth) return auth;

  const { phone: raw } = await ctx.params;
  const phone = decodeURIComponent(raw);
  const canonical = normalizePlPhoneE164(phone) ?? phone;

  const [orders, member, adjustments, redemptions, notes] = await Promise.all([
    getOrders(),
    getLoyaltyMember(canonical),
    getPointAdjustments(),
    getWalletRedemptions(),
    getCustomerNotes(canonical),
  ]);

  const myOrders = orders
    .filter((o) => o.customerPhone && phonesEqualPl(o.customerPhone, canonical) && o.status !== "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totalSpent = myOrders.reduce((acc, o) => acc + o.totalAmount, 0);
  const lastOrderAt = myOrders[0]?.createdAt;
  const firstOrderAt = myOrders[myOrders.length - 1]?.createdAt;
  const channels = Array.from(new Set(myOrders.map((o) => o.fulfillmentType)));
  const locations = Array.from(new Set(myOrders.map((o) => o.locationSlug)));

  const myAdjustments = adjustments.filter((a) => phonesEqualPl(a.phone, canonical));
  const manualPoints = myAdjustments.reduce((acc, a) => acc + a.amount, 0);
  const earnedPoints = Math.floor(totalSpent / 100);

  const myRedemptions = redemptions
    .filter((r) => phonesEqualPl(r.phone, canonical))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const redeemedPoints = myRedemptions.reduce((acc, r) => acc + r.points, 0);
  const spendablePoints = Math.max(0, earnedPoints + manualPoints - redeemedPoints);

  return NextResponse.json({
    phone: canonical,
    member,
    orders: myOrders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      status: o.status,
      totalAmount: o.totalAmount,
      itemCount: o.items.reduce((acc, ci) => acc + ci.quantity, 0),
      locationSlug: o.locationSlug,
      fulfillmentType: o.fulfillmentType,
    })),
    totals: {
      totalSpent,
      orderCount: myOrders.length,
      avgOrderValue: myOrders.length > 0 ? Math.round(totalSpent / myOrders.length) : 0,
      lastOrderAt,
      firstOrderAt,
      channels,
      locations,
      earnedPoints,
      manualPoints,
      redeemedPoints,
      spendablePoints,
      lifetimePoints: earnedPoints + manualPoints,
    },
    adjustments: myAdjustments,
    redemptions: myRedemptions,
    notes,
  });
}
