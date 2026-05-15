import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listWaSessions } from "@/lib/store";

export const GET = withAdmin({ roles: ["staff", "kitchen", "manager", "owner"] }, async () => {
  const sessions = await listWaSessions();
  // Newest activity first.
  sessions.sort((a, b) => (a.lastTurnAt < b.lastTurnAt ? 1 : -1));
  return NextResponse.json(
    sessions.map((s) => ({
      phone: s.phone,
      locationSlug: s.locationSlug,
      cartCount: s.cartItems.length,
      cartSubtotalGrosze: s.cartItems.reduce(
        (sum, c) => sum + c.menuItem.price * c.quantity,
        0,
      ),
      customerName: s.customerName,
      fulfillmentType: s.fulfillmentType,
      slotId: s.slotId,
      pendingOrderId: s.pendingOrderId,
      pendingPaymentUrl: s.pendingPaymentUrl,
      lastTurnAt: s.lastTurnAt,
    })),
  );
});
