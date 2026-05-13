import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders, getLoyaltyMembers, getPointAdjustments } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

interface CustomerSummary {
  phone: string;
  name: string;
  email?: string;
  totalSpent: number;
  orderCount: number;
  lastOrderAt?: string;
  firstOrderAt?: string;
  avgOrderValue: number;
  locations: string[];
  channels: string[];
  status: "new" | "active" | "repeat" | "lapsed";
  lifetimePoints: number;
}

const ACTIVE_DAYS = 30;
const LAPSED_DAYS = 90;
const MS_IN_DAY = 1000 * 60 * 60 * 24;

// Customer profiles span every location a customer has ever ordered at.
// Treated as chain-wide data: any authenticated staff can browse, but cross-
// location reads require unrestricted scope. When the caller passes
// ?location=, the customer aggregation is filtered to that location's
// orders so a scoped session sees only its own customer roster.
export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const allOrders = await getOrders();
    const orders = allOrders.filter(
      (o) =>
        o.status !== "pending" &&
        (!locationSlug || o.locationSlug === locationSlug),
    );
  const members = await getLoyaltyMembers();
  const memberMap = new Map(members.map((m) => [m.phone, m]));

  const map = new Map<string, CustomerSummary>();

  // Aggregate manual point adjustments by canonical phone — one read of the
  // log, then bucket by E.164 so customers with legacy phone formats roll up
  // together.
  const adjustments = await getPointAdjustments();
  const manualByPhone = new Map<string, number>();
  for (const a of adjustments) {
    const canonical = normalizePlPhoneE164(a.phone) ?? a.phone;
    manualByPhone.set(canonical, (manualByPhone.get(canonical) ?? 0) + a.amount);
  }

  for (const o of orders) {
    if (!o.customerPhone) continue;
    const phone = o.customerPhone;
    const existing = map.get(phone);
    const member = memberMap.get(phone);
    const fullName = (existing?.name ||
      [member?.name, member?.lastName].filter(Boolean).join(" ") ||
      o.customerName ||
      "Guest").trim();
    if (existing) {
      existing.totalSpent += o.totalAmount;
      existing.orderCount += 1;
      if (!existing.lastOrderAt || o.createdAt > existing.lastOrderAt) existing.lastOrderAt = o.createdAt;
      if (!existing.firstOrderAt || o.createdAt < existing.firstOrderAt) existing.firstOrderAt = o.createdAt;
      if (!existing.locations.includes(o.locationSlug)) existing.locations.push(o.locationSlug);
      if (!existing.channels.includes(o.fulfillmentType)) existing.channels.push(o.fulfillmentType);
    } else {
      map.set(phone, {
        phone,
        name: fullName || "Guest",
        email: member?.email,
        totalSpent: o.totalAmount,
        orderCount: 1,
        firstOrderAt: o.createdAt,
        lastOrderAt: o.createdAt,
        avgOrderValue: 0,
        locations: [o.locationSlug],
        channels: [o.fulfillmentType],
        status: "new",
        lifetimePoints: 0,
      });
    }
  }

  // Pull in members who haven't ordered yet so the team can still see them
  for (const m of members) {
    if (map.has(m.phone)) continue;
    map.set(m.phone, {
      phone: m.phone,
      name: [m.name, m.lastName].filter(Boolean).join(" ") || m.nickname || m.phone,
      email: m.email,
      totalSpent: 0,
      orderCount: 0,
      avgOrderValue: 0,
      locations: [],
      channels: [],
      status: "new",
      lifetimePoints: 0,
    });
  }

  const now = Date.now();
  const customers: CustomerSummary[] = [];
  for (const c of map.values()) {
    c.avgOrderValue = c.orderCount > 0 ? Math.round(c.totalSpent / c.orderCount) : 0;
    // Lifetime points: earned (1 pt per PLN) + manual adjustments
    const earnedPts = Math.floor(c.totalSpent / 100);
    const manualPts = manualByPhone.get(c.phone) ?? 0;
    c.lifetimePoints = earnedPts + manualPts;

    if (c.orderCount === 0) {
      c.status = "new";
    } else {
      const last = c.lastOrderAt ? new Date(c.lastOrderAt).getTime() : 0;
      const daysSince = (now - last) / MS_IN_DAY;
      if (daysSince > LAPSED_DAYS) c.status = "lapsed";
      else if (c.orderCount >= 2) c.status = "repeat";
      else if (daysSince <= ACTIVE_DAYS) c.status = "active";
      else c.status = "lapsed";
    }
    customers.push(c);
  }

    customers.sort((a, b) => b.totalSpent - a.totalSpent);
    return NextResponse.json(customers);
  },
);
