import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getOrders, getLoyaltyMembers, getAllManualPoints } from "@/lib/store";
import { calculateTier, LoyaltyTier } from "@/lib/loyalty";

export interface MemberRecord {
  phone: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  orders: number;
  totalSpent: number;
  lastOrder: string;
  source: "order" | "signup";
}


export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allOrders = await getOrders();
  const signups = await getLoyaltyMembers();
  const manualAdj = await getAllManualPoints();

  // Group orders by phone number
  const byPhone = new Map<string, typeof allOrders>();
  for (const order of allOrders) {
    if (!order.customerPhone) continue;
    const list = byPhone.get(order.customerPhone) || [];
    list.push(order);
    byPhone.set(order.customerPhone, list);
  }

  const memberMap = new Map<string, MemberRecord>();

  // Members from orders
  for (const [phone, orders] of byPhone) {
    const completed = orders.filter((o) => o.status !== "pending");
    const totalSpent = completed.reduce((sum, o) => sum + o.totalAmount, 0);
    const points = Math.floor(totalSpent / 100) + (manualAdj[phone] || 0);
    const latest = orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    memberMap.set(phone, {
      phone,
      name: latest.customerName,
      points,
      tier: calculateTier(points),
      orders: completed.length,
      totalSpent,
      lastOrder: latest.slotDate || latest.createdAt.split("T")[0],
      source: "order",
    });
  }

  // Members from phone-only signups (who haven't ordered yet)
  for (const signup of signups) {
    if (!memberMap.has(signup.phone)) {
      memberMap.set(signup.phone, {
        phone: signup.phone,
        name: signup.name,
        points: manualAdj[signup.phone] || 0,
        tier: calculateTier(manualAdj[signup.phone] || 0),
        orders: 0,
        totalSpent: 0,
        lastOrder: signup.signedUpAt.split("T")[0],
        source: "signup",
      });
    }
  }

  const members = Array.from(memberMap.values());
  members.sort((a, b) => b.points - a.points);

  return NextResponse.json({ members });
}
