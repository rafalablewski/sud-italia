import { NextRequest, NextResponse } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { getOrders, getOrderById, updateOrderStatus } from "@/lib/store";
import type { Order } from "@/data/types";

async function requireKitchenSession(): Promise<
  { error: NextResponse; session: null } | { error: null; session: { slug: string } }
> {
  const session = await getKitchenSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
    };
  }
  return { error: null, session };
}

export async function GET() {
  const { error, session } = await requireKitchenSession();
  if (error) return error;

  const orders = await getOrders(session!.slug);
  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(orders);
}

export async function PUT(req: NextRequest) {
  const { error, session } = await requireKitchenSession();
  if (error) return error;

  try {
    const { orderId, status } = await req.json();

    if (!orderId || !status) {
      return NextResponse.json({ error: "Missing orderId or status" }, { status: 400 });
    }

    const validStatuses: Order["status"][] = [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "completed",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.locationSlug !== session!.slug) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await updateOrderStatus(orderId, status);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
