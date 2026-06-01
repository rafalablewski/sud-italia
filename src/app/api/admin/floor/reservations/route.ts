import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getReservations, saveReservation, deleteReservation } from "@/lib/store";
import { findReservationConflicts, timeToMinutes } from "@/lib/floor";
import type { ReservationStatus } from "@/data/types";

/**
 * Reservations — per-location CRUD with double-booking conflict detection.
 * On create/update we check the candidate against active bookings on the same
 * table + date; a clash returns 409 unless the operator passes override:true
 * (deliberately double-seating). Manager+, location-scoped.
 */

const STATUSES: ReservationStatus[] = ["booked", "seated", "completed", "cancelled", "no-show"];

export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const date = req.nextUrl.searchParams.get("date") || undefined;
    return NextResponse.json(await getReservations(locationSlug ?? undefined, date));
  },
);

export const POST = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const customerName = String(body.customerName ?? "").trim();
    const partySize = Number(body.partySize);
    const date = String(body.date ?? "").trim();
    const time = String(body.time ?? "").trim();
    const durationMin = Number.isFinite(Number(body.durationMin)) ? Math.round(Number(body.durationMin)) : 90;

    if (!customerName) return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > 50) {
      return NextResponse.json({ error: "Party size must be 1–50" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    if (!Number.isFinite(timeToMinutes(time))) return NextResponse.json({ error: "Invalid time" }, { status: 400 });
    if (durationMin < 15 || durationMin > 600) {
      return NextResponse.json({ error: "Duration must be 15–600 min" }, { status: 400 });
    }
    const status: ReservationStatus = STATUSES.includes(body.status) ? body.status : "booked";
    const tableId = body.tableId ? String(body.tableId) : undefined;

    // Conflict check against the day's active bookings on the same table.
    const candidate = {
      id: typeof body.id === "string" ? body.id : "",
      locationSlug,
      tableId,
      date,
      time,
      durationMin,
    };
    const sameDay = await getReservations(locationSlug, date);
    const conflicts = findReservationConflicts(sameDay, candidate);
    if (conflicts.length > 0 && body.override !== true) {
      return NextResponse.json(
        {
          error: "conflict",
          conflicts: conflicts.map((c) => ({ id: c.id, customerName: c.customerName, time: c.time, durationMin: c.durationMin })),
        },
        { status: 409 },
      );
    }

    const reservation = await saveReservation({
      id: typeof body.id === "string" ? body.id : undefined,
      locationSlug,
      customerName,
      customerPhone: body.customerPhone ? String(body.customerPhone).trim() : undefined,
      partySize: Math.round(partySize),
      date,
      time,
      durationMin,
      tableId,
      // Preserve the merged-booking slot link on update (Service Book flow).
      slotId: body.slotId ? String(body.slotId) : undefined,
      status,
      notes: body.notes ? String(body.notes).trim() : undefined,
    });
    return NextResponse.json({ reservation, conflicts });
  },
);

export const DELETE = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deleteReservation(id);
    return NextResponse.json({ ok });
  },
);
