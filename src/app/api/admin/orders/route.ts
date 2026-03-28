import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getOrders, updateOrderStatus } from "@/lib/store";
import { Order } from "@/data/types";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const locationSlug = req.nextUrl.searchParams.get("location") || undefined;
  const orders = await getOrders(locationSlug);

  // Sort newest first
  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(orders);
}

export async function PUT(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { orderId, status } = await req.json();

    if (!orderId || !status) {
      return NextResponse.json({ error: "Missing orderId or status" }, { status: 400 });
    }

    const validStatuses: Order["status"][] = ["pending", "confirmed", "preparing", "ready", "completed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const order = await updateOrderStatus(orderId, status);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
