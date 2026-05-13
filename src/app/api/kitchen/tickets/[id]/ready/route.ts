import { NextRequest, NextResponse } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { getKdsTickets, markTicketReady } from "@/lib/store";

/**
 * Mark a station-level ticket as ready (m2_3). Cook taps this when they
 * finish their station's items; the ticket then flows to expo (m2_6).
 * Final bump from expo flips the order overall via bumpTicket → outbox →
 * customer SMS.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getKitchenSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const tickets = await getKdsTickets(session.slug, { includeBumped: true });
  const target = tickets.find((t) => t.id === id);
  if (!target) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  const updated = await markTicketReady(id);
  if (!updated) {
    return NextResponse.json({ error: "Mark-ready failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: updated });
}
