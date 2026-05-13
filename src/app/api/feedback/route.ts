import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/store";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

// In production, this would write to a reviews table.
// For now, we log and return success — the structure is ready for DB.

export async function POST(req: NextRequest) {
  // Public endpoint — rate-limit by client IP first, then refine by phone
  // once we've looked up the order. 5/min/IP is generous for an honest
  // re-submit after a flaky network but blocks review-stuffing abuse.
  const ipLimit = await enforceRateLimit({
    key: "feedback-ip",
    id: getClientIp(req),
    limit: 5,
    windowSec: 60,
  });
  if (ipLimit) return ipLimit;

  try {
    const body = await req.json();
    const { orderId, itemRatings, overallRatings, comment, email } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Phone-scoped limit prevents one customer from spamming reviews even
    // from different IPs (e.g. flipping VPN, switching off carrier WiFi).
    if (order.customerPhone) {
      const phoneLimit = await enforceRateLimit({
        key: "feedback-phone",
        id: order.customerPhone,
        limit: 5,
        windowSec: 60,
      });
      if (phoneLimit) return phoneLimit;
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
