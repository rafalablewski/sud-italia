import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/store";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json(
      { error: "Missing orderId parameter" },
      { status: 400 }
    );
  }

  const order = await getOrderById(orderId);

  if (!order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      slotTime: order.slotTime,
      slotDate: order.slotDate,
      totalAmount: order.totalAmount,
      items: order.items,
    },
    // Legacy fields for backward compatibility
    id: order.id,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    slotTime: order.slotTime,
    slotDate: order.slotDate,
    message:
      order.status === "ready"
        ? "Your order is ready!"
        : order.status === "preparing"
          ? "Your order is being prepared."
          : "Your order has been confirmed.",
  });
}
