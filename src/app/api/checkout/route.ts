import { NextRequest, NextResponse } from "next/server";
import { generateOrderId } from "@/lib/utils";
import { getMenu } from "@/data/menus";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, locationSlug, customerName, customerPhone } = body;

    if (!items?.length || !locationSlug || !customerName || !customerPhone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Server-side price lookup — never trust client-provided prices
    const menuItems = getMenu(locationSlug);
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));

    let calculatedTotal = 0;
    const verifiedItems: { id: string; name: string; price: number; quantity: number }[] = [];

    for (const item of items) {
      const menuItem = menuItemsById.get(item.id);
      if (!menuItem || !menuItem.available) {
        return NextResponse.json(
          { error: `Item "${item.id}" is not available` },
          { status: 400 }
        );
      }
      if (!item.quantity || item.quantity < 1 || !Number.isInteger(item.quantity)) {
        return NextResponse.json(
          { error: `Invalid quantity for "${menuItem.name}"` },
          { status: 400 }
        );
      }
      calculatedTotal += menuItem.price * item.quantity;
      verifiedItems.push({
        id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: item.quantity,
      });
    }

    const orderId = generateOrderId();

    // If Stripe is configured, create a checkout session
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = (await import("stripe")).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card", "p24"],
        line_items: verifiedItems.map((item) => ({
          price_data: {
            currency: "pln",
            product_data: {
              name: item.name,
            },
            unit_amount: item.price,
          },
          quantity: item.quantity,
        })),
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
      total: calculatedTotal,
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
