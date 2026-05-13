import { NextRequest, NextResponse } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { bumpTicket, getKdsTickets } from "@/lib/store";

/**
 * Bump (complete) a KDS ticket from the expo screen (m2_6). When this
 * is the last unbumped ticket for the order, store.ts.bumpTicket also
 * flips the order to "ready" — which fires the order.ready outbox event
 * → customer SMS via comms dispatcher (m2_17).
 *
 * Kitchen-session-authed. Tenancy: we verify the ticket belongs to the
 * session's location before bumping; a Kraków expo screen never bumps
 * a Warszawa ticket even if it knows the id.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getKitchenSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Quick existence + tenancy check. getKdsTickets is location-scoped so
  // looking up by id here scopes implicitly.
  const tickets = await getKdsTickets(session.slug, { includeBumped: true });
  const target = tickets.find((t) => t.id === id);
  if (!target) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (target.status === "bumped") {
    return NextResponse.json({ ok: true, ticket: target, alreadyBumped: true });
  }

  const updated = await bumpTicket(id);
  if (!updated) {
    return NextResponse.json({ error: "Bump failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: updated });
}
