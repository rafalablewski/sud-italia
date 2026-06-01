import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders, getTables } from "@/lib/store";
import { buildFloorTwin } from "@/lib/floor-twin";

/**
 * Floor Twin — the live economic simulation of the room (Module 3 keystone;
 * see docs/strategy/restaurant-os-blueprint.md §4). Realized turn-time + spend
 * velocity per table, live occupancy, and predicted free-in — all derived from
 * real dine-in orders + the current table list. Staff+ (seating is a
 * service-floor decision).
 *
 * GET /api/admin/floor-twin?location=
 */
export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location is required" }, { status: 400 });

    const [tables, allOrders] = await Promise.all([getTables(locationSlug), getOrders()]);
    const orders = allOrders.filter((o) => o.locationSlug === locationSlug);

    const twin = buildFloorTwin({
      tables: tables.map((t) => ({
        id: t.id,
        number: t.number,
        seats: t.seats,
        zone: t.zone,
        status: t.status,
      })),
      orders: orders.map((o) => ({
        tableId: o.tableId,
        partySize: o.partySize,
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        fulfillmentType: o.fulfillmentType,
        simulated: o.simulated,
      })),
    });

    return NextResponse.json({ twin });
  },
);
