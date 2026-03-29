import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/store";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ customer: null });
  }

  // Find all orders by this phone number
  const allOrders = await getOrders();
  const customerOrders = allOrders.filter(
    (o) => o.customerPhone === phone && o.status !== "pending"
  );

  if (customerOrders.length === 0) {
    return NextResponse.json({ customer: null });
  }

  // Build customer profile from order history
  const latest = customerOrders.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  )[0];

  const totalSpent = customerOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  // 1 point per 1 PLN spent
  const points = Math.floor(totalSpent / 100);

  return NextResponse.json({
    customer: {
      phone,
      name: latest.customerName,
      ordersCount: customerOrders.length,
      points,
    },
  });
}
