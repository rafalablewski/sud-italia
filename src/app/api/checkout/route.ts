import { NextRequest, NextResponse } from "next/server";
import { generateOrderId } from "@/lib/utils";
import { getMenu } from "@/data/menus";
import { getSlotById, incrementSlotOrders, createOrder, addNotification } from "@/lib/store";
import { FulfillmentType, CartItem } from "@/data/types";
import { formatPrice } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      items,
      locationSlug,
      customerName,
      customerPhone,
      fulfillmentType,
      slotId,
      slotDate,
      slotTime,
      deliveryAddress,
    } = body;

    if (!items?.length || !locationSlug || !customerName || !customerPhone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!slotId || !slotDate || !slotTime) {
      return NextResponse.json(
        { error: "Please select a time slot" },
        { status: 400 }
      );
    }

    if (!fulfillmentType || !["takeout", "delivery"].includes(fulfillmentType)) {
      return NextResponse.json(
        { error: "Invalid fulfillment type" },
        { status: 400 }
      );
    }

    if (fulfillmentType === "delivery" && !deliveryAddress?.trim()) {
      return NextResponse.json(
        { error: "Delivery address is required" },
        { status: 400 }
      );
    }

    // Validate slot exists and has capacity
    const slot = getSlotById(slotId);
    if (!slot) {
      return NextResponse.json(
        { error: "Time slot not found" },
        { status: 400 }
      );
    }

    if (slot.currentOrders >= slot.maxOrders) {
      return NextResponse.json(
        { error: "This time slot is full. Please select another." },
        { status: 400 }
      );
    }

    if (!slot.fulfillmentTypes.includes(fulfillmentType as FulfillmentType)) {
      return NextResponse.json(
        { error: `This slot does not support ${fulfillmentType}` },
        { status: 400 }
      );
    }

    // Server-side price lookup — never trust client-provided prices
    const menuItems = getMenu(locationSlug);
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));

    let calculatedTotal = 0;
    const verifiedItems: { id: string; name: string; price: number; quantity: number }[] = [];
    const orderItems: CartItem[] = [];

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
      orderItems.push({
        menuItem,
        quantity: item.quantity,
        locationSlug,
      });
    }

    const orderId = generateOrderId();

    // Reserve the slot
    if (!incrementSlotOrders(slotId)) {
      return NextResponse.json(
        { error: "This time slot just filled up. Please select another." },
        { status: 400 }
      );
    }

    // Create order record
    createOrder({
      id: orderId,
      locationSlug,
      items: orderItems,
      totalAmount: calculatedTotal,
      status: "pending",
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      fulfillmentType: fulfillmentType as FulfillmentType,
      deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : undefined,
      slotId,
      slotDate,
      slotTime,
      createdAt: new Date().toISOString(),
    });

    // Notify admin
    addNotification({
      type: "new_order",
      title: "New order received",
      message: `${customerName.trim()} — ${formatPrice(calculatedTotal)} — ${fulfillmentType} at ${slotTime}`,
      locationSlug,
    });

    // Check if slot is now full and notify
    const updatedSlot = getSlotById(slotId);
    if (updatedSlot && updatedSlot.currentOrders >= updatedSlot.maxOrders) {
      addNotification({
        type: "slot_full",
        title: "Time slot full",
        message: `${slotDate} ${slotTime} slot is now fully booked (${updatedSlot.maxOrders} orders)`,
        locationSlug,
      });
    }

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
          fulfillmentType,
          slotId,
          slotTime,
          slotDate,
        },
      });

      return NextResponse.json({ url: session.url, orderId });
    }

    // Fallback: no Stripe configured — return order ID directly (demo mode)
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
