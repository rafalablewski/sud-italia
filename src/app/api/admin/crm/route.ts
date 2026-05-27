import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getCustomerNotes,
  getCustomers,
  getLoyaltyMembers,
  getOrders,
  getPointAdjustments,
} from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import type { Order } from "@/data/types";

// The CRM ("Regulars") book — the system of record for every customer who
// leaves data, not only loyalty members. One pass over the same live sources
// the /admin/customers list reads (orders + loyalty members + point
// adjustments), enriched with the relationship signals the Regulars profile
// needs: channels, favourites, recent orders, reliability, lifecycle and the
// consent flags off the customers rollup. No mock data — every field is
// derived from real orders.

const ACTIVE_DAYS = 30;
const LAPSED_DAYS = 90;
const MS_IN_DAY = 1000 * 60 * 60 * 24;

type Lifecycle = "new" | "active" | "repeat" | "lapsed";

interface CrmCustomer {
  phone: string;
  name: string;
  email: string | null;
  member: boolean;
  vip: boolean;
  birthday: string | null;
  totalSpent: number;
  orderCount: number;
  avgOrderValue: number;
  points: number;
  tier: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  lastDays: number | null;
  locations: string[];
  channels: string[];
  agentic: boolean;
  noShows: number;
  reliability: number;
  lifecycle: Lifecycle;
  source: string;
  favourites: { name: string; category: string; qty: number }[];
  recent: {
    id: string;
    createdAt: string;
    total: number;
    fulfillment: string;
    channel: string;
    location: string;
    items: { name: string; qty: number }[];
  }[];
  notesCount: number;
  smsOptIn: boolean;
  emailOptIn: boolean;
}

const FULFILLMENT_LABEL: Record<string, string> = {
  takeout: "Takeout",
  delivery: "Delivery",
  "dine-in": "Dine-in",
};

function tierOf(points: number): string {
  if (points >= 5000) return "Platinum";
  if (points >= 1500) return "Gold";
  if (points >= 500) return "Silver";
  return "Bronze";
}

function channelsFor(orders: Order[]): { labels: string[]; agentic: boolean } {
  const set = new Set<string>();
  let agentic = false;
  for (const o of orders) {
    set.add(FULFILLMENT_LABEL[o.fulfillmentType] ?? o.fulfillmentType);
    if (o.channel === "whatsapp") {
      set.add("WhatsApp");
      agentic = true;
    }
  }
  return { labels: [...set], agentic };
}

interface Acc {
  phone: string;
  name: string;
  paid: Order[];
  noShows: number;
  allLocations: Set<string>;
}

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const [allOrders, members, adjustments, rollups, allNotes] = await Promise.all([
      getOrders(),
      getLoyaltyMembers(),
      getPointAdjustments(),
      getCustomers(),
      getCustomerNotes(),
    ]);

    // Keyed by canonical E.164 so the lookup matches the normalized phones we
    // bucket orders under below — members with legacy formatting still link.
    const memberMap = new Map(
      members.map((m) => [normalizePlPhoneE164(m.phone) ?? m.phone, m]),
    );

    const manualByPhone = new Map<string, number>();
    for (const a of adjustments) {
      const canonical = normalizePlPhoneE164(a.phone) ?? a.phone;
      manualByPhone.set(canonical, (manualByPhone.get(canonical) ?? 0) + a.amount);
    }

    const notesByPhone = new Map<string, number>();
    for (const n of allNotes) {
      const canonical = normalizePlPhoneE164(n.phone) ?? n.phone;
      notesByPhone.set(canonical, (notesByPhone.get(canonical) ?? 0) + 1);
    }

    const consentByPhone = new Map(rollups.map((r) => [r.phone, r]));

    const orders = allOrders.filter(
      (o) =>
        o.status !== "pending" &&
        !!o.customerPhone &&
        (!locationSlug || o.locationSlug === locationSlug),
    );

    const acc = new Map<string, Acc>();
    for (const o of orders) {
      const phone = normalizePlPhoneE164(o.customerPhone) ?? o.customerPhone;
      let a = acc.get(phone);
      if (!a) {
        a = { phone, name: "", paid: [], noShows: 0, allLocations: new Set() };
        acc.set(phone, a);
      }
      a.allLocations.add(o.locationSlug);
      if (o.status === "cancelled") {
        a.noShows += 1;
      } else {
        a.paid.push(o);
        if (o.customerName) a.name = o.customerName;
      }
    }

    // Loyalty members who haven't ordered yet still belong in the book.
    for (const m of members) {
      const phone = normalizePlPhoneE164(m.phone) ?? m.phone;
      if (!acc.has(phone) && !locationSlug) {
        acc.set(phone, { phone, name: "", paid: [], noShows: 0, allLocations: new Set() });
      }
    }

    const now = Date.now();
    const out: CrmCustomer[] = [];

    for (const a of acc.values()) {
      const member = memberMap.get(a.phone);
      const paid = a.paid;
      const totalSpent = paid.reduce((s, o) => s + o.totalAmount, 0);
      const orderCount = paid.length;

      let firstOrderAt: string | undefined;
      let lastOrderAt: string | undefined;
      for (const o of paid) {
        if (!firstOrderAt || o.createdAt < firstOrderAt) firstOrderAt = o.createdAt;
        if (!lastOrderAt || o.createdAt > lastOrderAt) lastOrderAt = o.createdAt;
      }

      const name =
        [member?.name, member?.lastName].filter(Boolean).join(" ").trim() ||
        member?.nickname ||
        a.name ||
        "Guest";

      const earnedPoints = Math.floor(totalSpent / 100);
      const points = earnedPoints + (manualByPhone.get(a.phone) ?? 0);

      // Favourites — total quantity per item across paid orders, top 4.
      const favMap = new Map<string, { name: string; category: string; qty: number }>();
      for (const o of paid) {
        for (const ci of o.items) {
          const key = ci.menuItem.id;
          const ex = favMap.get(key);
          if (ex) ex.qty += ci.quantity;
          else
            favMap.set(key, {
              name: ci.menuItem.name,
              category: ci.menuItem.category,
              qty: ci.quantity,
            });
        }
      }
      const favourites = [...favMap.values()].sort((x, y) => y.qty - x.qty).slice(0, 4);

      const recent = [...paid]
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
        .slice(0, 3)
        .map((o) => ({
          id: o.id,
          createdAt: o.createdAt,
          total: o.totalAmount,
          fulfillment: FULFILLMENT_LABEL[o.fulfillmentType] ?? o.fulfillmentType,
          channel: o.channel === "whatsapp" ? "WhatsApp" : "Web",
          location: o.locationSlug,
          items: o.items.map((ci) => ({ name: ci.menuItem.name, qty: ci.quantity })),
        }));

      const { labels: channels, agentic } = channelsFor(paid);

      const lastDays = lastOrderAt
        ? Math.round((now - new Date(lastOrderAt).getTime()) / MS_IN_DAY)
        : null;

      let lifecycle: Lifecycle;
      if (orderCount === 0) lifecycle = "new";
      else if (lastDays != null && lastDays > LAPSED_DAYS) lifecycle = "lapsed";
      else if (orderCount >= 2) lifecycle = "repeat";
      else if (lastDays != null && lastDays <= ACTIVE_DAYS) lifecycle = "active";
      else lifecycle = "lapsed";

      const tier = tierOf(points);
      const vip = points >= 1500 || totalSpent >= 100000;

      const reliability =
        orderCount + a.noShows > 0
          ? Math.round((orderCount / (orderCount + a.noShows)) * 100)
          : 100;

      let source: string;
      if (member?.signedUpAt) source = "Loyalty signup";
      else if (agentic) source = "WhatsApp agent";
      else if (member?.email) source = "Email receipt";
      else source = "Order";

      const rollup = consentByPhone.get(a.phone);

      out.push({
        phone: a.phone,
        name,
        email: member?.email ?? null,
        member: !!member,
        vip,
        birthday: member?.dob ?? null,
        totalSpent,
        orderCount,
        avgOrderValue: orderCount > 0 ? Math.round(totalSpent / orderCount) : 0,
        points,
        tier,
        firstOrderAt: firstOrderAt ?? null,
        lastOrderAt: lastOrderAt ?? null,
        lastDays,
        locations: [...a.allLocations],
        channels,
        agentic,
        noShows: a.noShows,
        reliability,
        lifecycle,
        source,
        favourites,
        recent,
        notesCount: notesByPhone.get(a.phone) ?? 0,
        smsOptIn: !(rollup?.smsOptout ?? false),
        emailOptIn: !(rollup?.emailOptout ?? false),
      });
    }

    out.sort((x, y) => y.totalSpent - x.totalSpent);
    return NextResponse.json(out);
  },
);
