import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrdersByPhone } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { buildCustomerIntelligence } from "@/lib/customer-intelligence";

/**
 * Customer Intelligence — the per-customer behavioural graph + next-order
 * prediction (keystone of the Customer Identity Network; see
 * docs/strategy/restaurant-os-blueprint.md). Reads the guest's real order
 * history (chain-wide, across locations — a regular may visit both trucks) and
 * runs the pure-compute engine. No mock data; everything is derived from live
 * orders.
 *
 * GET /api/admin/customer-intelligence?phone=+48...
 */
export const GET = withAdmin({ roles: ["staff"] }, async (req) => {
  const url = new URL(req.url);
  const phoneRaw = url.searchParams.get("phone")?.trim();
  if (!phoneRaw) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const phone = normalizePlPhoneE164(phoneRaw) || phoneRaw;
  // getOrdersByPhone canonicalises internally and returns chain-wide,
  // non-pending orders; the engine re-filters (cancelled / simulated) and
  // buckets by the same canonical phone.
  const orders = await getOrdersByPhone(phone);
  const intelligence = buildCustomerIntelligence(phone, orders);

  return NextResponse.json({ intelligence });
});
