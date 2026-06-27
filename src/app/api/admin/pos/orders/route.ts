import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders } from "@/lib/store";
import { fireTab, chargeTab, PosActionError } from "@/lib/pos/fireTab";

/**
 * POS order actuator (the web POS). The tab → Order bridge is the SHARED
 * `@/lib/pos/fireTab` (also used by `/api/v1/admin/pos/tabs/:id/{fire,charge}`),
 * so the web and native tills fire/charge through one implementation.
 *
 *   GET   → this location's live (active) orders, for any board that wants them.
 *   POST  → "Send to KDS" / "Fire course" (build/re-sync the tab's Order).
 *   PATCH → "Charge" (ensure order, mark paid, close the tab).
 *
 * Both write paths read the tab from the store as the source of truth — the till
 * can only point at a tab id. Staff+, location-scoped.
 */

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);

/** The standard idempotency header — a POS click sends a fresh key; a network
 *  retry of that click reuses it, so the mutation runs at most once. */
function idemKey(req: Request): string | null {
  return req.headers.get("idempotency-key");
}

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const orders = await getOrders(locationSlug ?? undefined, todayStart.toISOString());
    const active = orders
      .filter((o) => ACTIVE.has(o.status))
      .map((o) => ({
        id: o.id,
        status: o.status,
        fulfillmentType: o.fulfillmentType,
        customerName: o.customerName,
        partySize: o.partySize,
        tableId: o.tableId,
        totalAmount: o.totalAmount,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        createdAt: o.createdAt,
      }));
    return NextResponse.json({ orders: active });
  },
);

// Send a tab to the kitchen (create or re-sync its Order). Coursing-aware.
export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const tabId = body && typeof body.tabId === "string" ? body.tabId : "";
    if (!tabId) return NextResponse.json({ error: "tabId required" }, { status: 400 });

    try {
      const result = await fireTab({
        tabId,
        locationSlug,
        courses: body?.courses,
        fireAll: body?.fireAll === true,
        idempotencyKey: idemKey(req),
      });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof PosActionError) return NextResponse.json({ error: e.message }, { status: e.httpStatus });
      throw e;
    }
  },
);

// Charge a tab: ensure the order exists, mark it paid, then close the tab.
export const PATCH = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const tabId = body && typeof body.tabId === "string" ? body.tabId : "";
    if (!tabId) return NextResponse.json({ error: "tabId required" }, { status: 400 });

    try {
      const result = await chargeTab({ tabId, locationSlug, idempotencyKey: idemKey(req) });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof PosActionError) return NextResponse.json({ error: e.message }, { status: e.httpStatus });
      throw e;
    }
  },
);
