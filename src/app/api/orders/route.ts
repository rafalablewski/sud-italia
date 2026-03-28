import { NextRequest, NextResponse } from "next/server";

// In production, this would be backed by a database
// For now, this is a placeholder API that demonstrates the endpoint structure

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json(
      { error: "Missing orderId parameter" },
      { status: 400 }
    );
  }

  // Placeholder response — in production, fetch from database
  return NextResponse.json({
    id: orderId,
    status: "confirmed",
    message: "Your order has been confirmed and is being prepared.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, locationSlug, items, customerName, customerPhone } = body;

    if (!orderId || !locationSlug || !items?.length || !customerName || !customerPhone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // In production, save to database
    console.log("New order created:", { orderId, locationSlug, customerName });

    return NextResponse.json({
      id: orderId,
      status: "pending",
      message: "Order created successfully",
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
