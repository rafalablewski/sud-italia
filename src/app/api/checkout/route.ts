import { NextRequest, NextResponse } from "next/server";
import { generateOrderId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, locationSlug, customerName, customerPhone, total } = body;

    if (!items?.length || !locationSlug || !customerName || !customerPhone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate total matches items
    const calculatedTotal = items.reduce(
      (sum: number, item: { price: number; quantity: number }) =>
        sum + item.price * item.quantity,
      0
    );

    if (calculatedTotal !== total) {
      return NextResponse.json(
        { error: "Total mismatch" },
        { status: 400 }
      );
    }

    const orderId = generateOrderId();

    // If Stripe is configured, create a checkout session
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = (await import("stripe")).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card", "p24"],
        line_items: items.map(
          (item: { name: string; price: number; quantity: number }) => ({
            price_data: {
              currency: "pln",
              product_data: {
                name: item.name,
              },
              unit_amount: item.price,
            },
            quantity: item.quantity,
          })
        ),
        mode: "payment",
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin}/order-confirmation?orderId=${orderId}&location=${locationSlug}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin}/locations/${locationSlug}`,
        metadata: {
          orderId,
          locationSlug,
          customerName,
          customerPhone,
        },
      });

      return NextResponse.json({ url: session.url });
    }

    // Fallback: no Stripe configured — return order ID directly
    return NextResponse.json({
      orderId,
      message: "Order placed successfully (demo mode — no payment configured)",
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
