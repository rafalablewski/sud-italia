import { NextRequest, NextResponse } from "next/server";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { getMenuWithOverrides } from "@/data/menus";
import {
  isActiveLocationSlug,
  upsertCartPresence,
  type CartPresenceLine,
} from "@/lib/store";
import { notifyCartPresence } from "@/lib/cart-presence-broadcast";
import { isVisitorUuidV4 } from "@/lib/uuid-v4";

function normalizeItemsForLocation(
  slug: string,
  rawItems: unknown,
  menu: Awaited<ReturnType<typeof getMenuWithOverrides>>
): { items: CartPresenceLine[]; totalCents: number } {
  if (!Array.isArray(rawItems)) return { items: [], totalCents: 0 };
  const byId = new Map(menu.filter((m) => m.available).map((m) => [m.id, m]));
  const items: CartPresenceLine[] = [];
  let totalCents = 0;
  for (const row of rawItems.slice(0, 50)) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    const quantity = (row as { quantity?: unknown }).quantity;
    if (typeof id !== "string" || id.length > 128) continue;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      continue;
    }
    const m = byId.get(id);
    if (!m) continue;
    items.push({ id, quantity });
    totalCents += m.price * quantity;
  }
  return { items, totalCents };
}

export async function POST(req: NextRequest) {
  if (!isCartPresenceEnabled()) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = await req.json();
    const visitorId = body?.visitorId;
    const locationSlug = body?.locationSlug;
    const rawItems = body?.items;
    const rawLineCount = Array.isArray(rawItems) ? rawItems.length : 0;

    if (typeof visitorId !== "string" || !isVisitorUuidV4(visitorId)) {
      return NextResponse.json({ error: "Invalid visitor id" }, { status: 400 });
    }
    if (typeof locationSlug !== "string" || !locationSlug) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }
    if (!isActiveLocationSlug(locationSlug)) {
      return NextResponse.json({ error: "Unknown location" }, { status: 404 });
    }

    const menu = await getMenuWithOverrides(locationSlug);
    const { items, totalCents } = normalizeItemsForLocation(locationSlug, rawItems, menu);

    const result = await upsertCartPresence(locationSlug, visitorId, items, totalCents);
    if (result === "rate_limited") {
      return NextResponse.json({ error: "Too many updates" }, { status: 429 });
    }

    notifyCartPresence(locationSlug);

    return NextResponse.json({
      success: true,
      lineCount: items.length,
      itemsAccepted: items.length > 0,
      itemsDropped: rawLineCount > 0 && items.length === 0,
    });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
