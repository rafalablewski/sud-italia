import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/store";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ORDERS = 2;
const MAX_IDS = 8;

/**
 * Real order-frequency for the last 7 days at a location (non-cancelled orders).
 * Used for honest "hot this week" badges — no fake numbers.
 */
export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get("location");
  if (!location) {
    return NextResponse.json({ itemIds: [] as string[] });
  }

  const orders = await getOrders(location);
  const since = Date.now() - WEEK_MS;
  const counts = new Map<string, number>();

  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const t = new Date(o.createdAt).getTime();
    if (Number.isNaN(t) || t < since) continue;
    for (const line of o.items) {
      const id = line.menuItem?.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + line.quantity);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const itemIds = sorted
    .filter(([, qty]) => qty >= MIN_ORDERS)
    .slice(0, MAX_IDS)
    .map(([id]) => id);

  return NextResponse.json({ itemIds });
}
