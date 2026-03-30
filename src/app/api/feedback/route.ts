import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/store";

// In production, this would write to a reviews table.
// For now, we log and return success — the structure is ready for DB.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, itemRatings, overallRatings, comment, email } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // Validate the order exists
    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Log the review (in production: INSERT INTO reviews)
    console.log("[Review]", {
      orderId,
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      locationSlug: order.locationSlug,
      itemRatings,    // { "krk-pizza-margherita": 5, "krk-drink-limonata": 4 }
      overallRatings, // { "speed": 4, "service": 5, "value": 4 }
      comment,
      email,
      submittedAt: new Date().toISOString(),
    });

    // If email provided, save it to the customer record
    // In production: UPDATE customers SET email = $email WHERE phone = $phone
    if (email) {
      console.log("[Email Collected]", {
        phone: order.customerPhone,
        email,
        source: "post-order-review",
      });
    }

    return NextResponse.json({
      success: true,
      pointsEarned: 10,
      message: "Thank you for your review!",
    });
  } catch (error) {
    console.error("Feedback error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
