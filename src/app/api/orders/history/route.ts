import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/store";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ orders: [] });
  }

  // Fetch all orders, filter by phone, return most recent 5
  const allOrders = await getOrders();
  const customerOrders = allOrders
    .filter(
      (o) =>
        o.customerPhone === phone &&
        o.status !== "pending" // only confirmed+ orders
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  // Map to a lightweight shape for the client
  const history = customerOrders.map((o) => ({
    orderId: o.id,
    date: o.slotDate || o.createdAt.split("T")[0],
    locationSlug: o.locationSlug,
    total: o.totalAmount,
    items: o.items.map((ci) => ({
      id: ci.menuItem.id,
      name: ci.menuItem.name,
      quantity: ci.quantity,
      price: ci.menuItem.price,
    })),
  }));

  return NextResponse.json({ orders: history });
}
