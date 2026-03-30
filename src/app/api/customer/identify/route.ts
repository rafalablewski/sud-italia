import { NextRequest, NextResponse } from "next/server";
import { getOrders, getLoyaltyMember, addLoyaltyMember, getManualPointsTotal } from "@/lib/store";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  const signup = req.nextUrl.searchParams.get("signup");

  if (!phone) {
    return NextResponse.json({ customer: null });
  }

  // Find all orders by this phone number
  const allOrders = await getOrders();
  const customerOrders = allOrders.filter(
    (o) => o.customerPhone === phone && o.status !== "pending"
  );

  if (customerOrders.length > 0) {
    const latest = customerOrders.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    )[0];

    const totalSpent = customerOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const manualPoints = await getManualPointsTotal(phone);
    const points = Math.floor(totalSpent / 100) + manualPoints;

    // Also ensure they're in the members list
    await addLoyaltyMember({
      phone,
      name: latest.customerName,
      signedUpAt: new Date().toISOString(),
    });

    return NextResponse.json({
      customer: {
        phone,
        name: latest.customerName,
        ordersCount: customerOrders.length,
        points,
        isNew: false,
      },
    });
  }

  // Check if they signed up without ordering
  const existing = await getLoyaltyMember(phone);
  if (existing) {
    const manualPoints = await getManualPointsTotal(phone);
    return NextResponse.json({
      customer: {
        phone: existing.phone,
        name: existing.name,
        ordersCount: 0,
        points: manualPoints,
        isNew: false,
      },
    });
  }

  // New signup
  if (signup === "true") {
    await addLoyaltyMember({
      phone,
      name: "New Member",
      signedUpAt: new Date().toISOString(),
    });

    return NextResponse.json({
      customer: {
        phone,
        name: "New Member",
        ordersCount: 0,
        points: 0,
        isNew: true,
      },
    });
  }

  return NextResponse.json({ customer: null });
}
