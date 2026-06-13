import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { deleteEvent, getEvents, saveEvent } from "@/lib/store";
import type { BookingEventStatus } from "@/data/types";

const VALID_STATUS: BookingEventStatus[] = ["scheduled", "live", "done", "cancelled"];

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const from = req.nextUrl.searchParams.get("from") || undefined;
    const to = req.nextUrl.searchParams.get("to") || undefined;
    return NextResponse.json(
      await getEvents({
        locationSlug: locationSlug ?? undefined,
        from,
        to,
      }),
    );
  },
);

async function upsertEvent(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name?.trim() || !body.locationSlug || !body.date) {
      return NextResponse.json({ error: "name + locationSlug + date required" }, { status: 400 });
    }
    if (!(await hasLocationAccess(body.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${body.locationSlug}"` },
        { status: 403 },
      );
    }
    const status: BookingEventStatus = VALID_STATUS.includes(body.status) ? body.status : "scheduled";
    const saved = await saveEvent({
      id: body.id,
      routeId: body.routeId || undefined,
      locationSlug: body.locationSlug,
      name: body.name.trim(),
      date: body.date,
      expectedAttendance: body.expectedAttendance !== undefined ? Number(body.expectedAttendance) : undefined,
      actualRevenueGrosze: body.actualRevenueGrosze !== undefined ? Number(body.actualRevenueGrosze) : undefined,
      actualOrders: body.actualOrders !== undefined ? Number(body.actualOrders) : undefined,
      notes: body.notes,
      status,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertEvent(req),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertEvent(req),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteEvent(id);
    return NextResponse.json({ ok });
  },
);
