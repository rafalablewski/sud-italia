import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/store";

// Public endpoint — clients use this to see available time slots
export async function GET(req: NextRequest) {
  const locationSlug = req.nextUrl.searchParams.get("location");
  const date = req.nextUrl.searchParams.get("date");
  const fulfillmentType = req.nextUrl.searchParams.get("type") || undefined;

  if (!locationSlug || !date) {
    return NextResponse.json(
      { error: "Missing location or date parameter" },
      { status: 400 }
    );
  }

  const slots = await getAvailableSlots(locationSlug, date, fulfillmentType);

  // Return only what clients need (hide internal fields)
  const clientSlots = slots.map((s) => ({
    id: s.id,
    time: s.time,
    fulfillmentTypes: s.fulfillmentTypes,
    spotsLeft: s.maxOrders - s.currentOrders,
    // Minimum order value (grosze) to book this slot; 0 = none. Enforced
    // server-side at checkout, surfaced here so the picker can show it.
    minSpend: s.minSpendGrosze ?? 0,
  }));

  // Sort by time
  clientSlots.sort((a, b) => a.time.localeCompare(b.time));

  return NextResponse.json(clientSlots);
}
