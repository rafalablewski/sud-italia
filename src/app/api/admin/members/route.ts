import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getCurrentLocationScope, LOCATION_SCOPE_ALL } from "@/lib/admin-auth";
import { getOrders, getLoyaltyMembers, getAllManualPoints, getLoyaltySettings } from "@/lib/store";
import { calculateTier, LoyaltyTier } from "@/lib/loyalty";
import { normalizePlPhoneE164, sumManualPointsForPhone } from "@/lib/phone";

export interface MemberRecord {
  phone: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  orders: number;
  totalSpent: number;
  lastOrder: string;
  source: "order" | "signup";
  locations: string[]; // which locations they've ordered from
}


// Loyalty member roster. Cross-location data — a member may have ordered at
// multiple trucks. Scoped sessions see only members whose orders include
// at least one in-scope location.
export const GET = withAdmin({}, async () => {
  const scope = (await getCurrentLocationScope()) ?? [LOCATION_SCOPE_ALL];
  const unrestricted = scope.includes(LOCATION_SCOPE_ALL);

  const [allOrders, signups, manualAdj, loyalty] = await Promise.all([
    getOrders(),
    getLoyaltyMembers(),
    getAllManualPoints(),
    getLoyaltySettings(),
  ]);
  const tiers = loyalty.tiers;

  // Group orders by normalized phone
  const byPhone = new Map<string, typeof allOrders>();
  for (const order of allOrders) {
    if (!order.customerPhone) continue;
    if (!unrestricted && !scope.includes(order.locationSlug)) continue;
    const key = normalizePlPhoneE164(order.customerPhone) || order.customerPhone.trim();
    const list = byPhone.get(key) || [];
    list.push(order);
    byPhone.set(key, list);
  }

  const memberMap = new Map<string, MemberRecord>();

  // Members from orders
  for (const [phone, orders] of byPhone) {
    const completed = orders.filter((o) => o.status !== "pending");
    const totalSpent = completed.reduce((sum, o) => sum + o.totalAmount, 0);
    const points = Math.floor(totalSpent / 100) + sumManualPointsForPhone(phone, manualAdj);
    const latest = orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const locations = [...new Set(orders.map((o) => o.locationSlug))];
    memberMap.set(phone, {
      phone: normalizePlPhoneE164(latest.customerPhone) || phone,
      name: latest.customerName,
      points,
      tier: calculateTier(points, tiers),
      orders: completed.length,
      totalSpent,
      lastOrder: latest.slotDate || latest.createdAt.split("T")[0],
      source: "order",
      locations,
    });
  }

  // Members from phone-only signups (who haven't ordered yet)
  for (const signup of signups) {
    const signupKey = normalizePlPhoneE164(signup.phone) || signup.phone.trim();
    if (!memberMap.has(signupKey)) {
      const manual = sumManualPointsForPhone(signup.phone, manualAdj);
      memberMap.set(signupKey, {
        phone: signupKey,
        name: signup.name,
        points: manual,
        tier: calculateTier(manual, tiers),
        orders: 0,
        totalSpent: 0,
        lastOrder: signup.signedUpAt.split("T")[0],
        source: "signup",
        locations: [],
      });
    }
  }

  const members = Array.from(memberMap.values());
  members.sort((a, b) => b.points - a.points);

  return NextResponse.json({ members });
});
