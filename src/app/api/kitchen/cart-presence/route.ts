import { NextResponse } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { getKitchenCartPresenceEntries } from "@/lib/cart-presence-kitchen";
import type {
  KitchenCartPresenceEntry,
  KitchenCartPresenceItem,
  KitchenCartPresencePayload,
} from "@/lib/kitchen-cart-presence-payload";

export type { KitchenCartPresenceEntry, KitchenCartPresenceItem, KitchenCartPresencePayload };

export async function GET() {
  const session = await getKitchenSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCartPresenceEnabled()) {
    const body: KitchenCartPresencePayload = { enabled: false, carts: [] };
    return NextResponse.json(body);
  }

  const carts = await getKitchenCartPresenceEntries(session.slug);
  const body: KitchenCartPresencePayload = { enabled: true, carts };
  return NextResponse.json(body);
}
