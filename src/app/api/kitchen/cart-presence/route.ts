import { NextResponse } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import {
  getKitchenCartPresenceEntries,
  type KitchenCartPresenceEntry,
  type KitchenCartPresenceItem,
} from "@/lib/cart-presence-kitchen";

export type { KitchenCartPresenceEntry, KitchenCartPresenceItem };

export async function GET() {
  const session = await getKitchenSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCartPresenceEnabled()) {
    return NextResponse.json([] satisfies KitchenCartPresenceEntry[]);
  }

  const enriched = await getKitchenCartPresenceEntries(session.slug);
  return NextResponse.json(enriched);
}
