import { NextRequest, NextResponse } from "next/server";
import { getOrdersByPhone } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

/**
 * Per-item attach counts for a single phone (audit §3.1 — pairing graph).
 *
 * Returns:
 *   {
 *     orderCount: number,                       // non-pending orders this phone has placed
 *     attachByItemId: Record<string, number>,   // how many of those orders included each item id
 *   }
 *
 * Cart drawer fetches this once on open and feeds it into `getCartSuggestions(..., pairingContext)`
 * so the chip ranking shifts with the customer's history. Pure read endpoint
 * — safe to cache for the duration of a session.
 *
 * No phone → empty payload (treated as a brand-new customer by scorePairing,
 * which still yields a usable margin × hour ranking).
 */
export async function GET(req: NextRequest) {
  const phoneRaw = req.nextUrl.searchParams.get("phone");
  if (!phoneRaw) {
    return NextResponse.json({ orderCount: 0, attachByItemId: {} });
  }
  const phone = normalizePlPhoneE164(phoneRaw);
  if (!phone) {
    return NextResponse.json({ orderCount: 0, attachByItemId: {} });
  }

  // Uses the orders_customer_phone_idx index so this is O(N) in the
  // customer's own order count, not the total order table.
  const mine = await getOrdersByPhone(phone);

  const attachByItemId: Record<string, number> = {};
  for (const o of mine) {
    const seen = new Set<string>();
    for (const line of o.items) {
      const id = line.menuItem?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      attachByItemId[id] = (attachByItemId[id] ?? 0) + 1;
    }
  }

  return NextResponse.json({ orderCount: mine.length, attachByItemId });
}
