import { NextRequest, NextResponse } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { getKdsTickets } from "@/lib/store";

/**
 * Active tickets for the kitchen session's location (m2_6 expo screen).
 * Returns fired + ready + recalled tickets sorted by firedAt asc so the
 * oldest order is first on screen (FIFO). Includes promised_ready_at so
 * the expo can render the countdown + red+audible overdue indicator.
 */
export async function GET(_req: NextRequest) {
  const session = await getKitchenSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tickets = await getKdsTickets(session.slug, { includeBumped: false });
  return NextResponse.json({ tickets });
}
