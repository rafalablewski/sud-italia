import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getReservations, saveReservation, deleteReservation, getTables, saveTable, getOrders, getPosTabs, savePosTab, deletePosTab, getServiceWindow } from "@/lib/store";
import { durationBeforeClose, findReservationConflicts, minutesToTime, serviceWindowViolation, timeToMinutes } from "@/lib/floor";
import { TABLE_FEATURES, type ReservationStatus, type TableFeature } from "@/data/types";

/**
 * Reservations — per-location CRUD with double-booking conflict detection.
 * On create/update we check the candidate against active bookings on the same
 * table + date; a clash returns 409 unless the operator passes override:true
 * (deliberately double-seating). Manager+, location-scoped.
 */

const STATUSES: ReservationStatus[] = ["booked", "seated", "completed", "cancelled", "no-show"];
/** Order statuses that physically hold a table (mirror the floor-twin set). */
const ORDER_HOLDS_TABLE = new Set(["confirmed", "preparing", "ready"]);

/**
 * TableSession spine — mirror a reservation's live occupancy onto the shared
 * FloorTable.status so Book & Seat and the POS table picker read ONE truth.
 * Seating a booking here now flips its table to `seated`; completing /
 * no-showing / cancelling frees it — but only when nothing else holds it (no
 * other seated booking on that table, no open dine-in check). Called after the
 * reservation is saved, scoped to the reservation's own date so a future edit
 * never disturbs tonight's floor. Best-effort: a floor hiccup must not fail the
 * booking write, so the caller swallows errors.
 */
async function reconcileFloorTable(locationSlug: string, tableId: string, date: string): Promise<void> {
  const tables = await getTables(locationSlug);
  const table = tables.find((t) => t.id === tableId);
  // Only the two occupancy states are ours to drive — never touch a table an
  // operator has parked out-of-service or explicitly marked reserved.
  if (!table || table.status === "out-of-service") return;

  const dayRes = await getReservations(locationSlug, date);
  // A table is "seated" if it's the primary OR one of the joined tables of a
  // seated booking (a combined big-party spread across several tables).
  const seatedHere = dayRes.some(
    (r) => r.status === "seated" && (r.tableId === tableId || r.joinedTableIds?.includes(tableId)),
  );

  if (seatedHere) {
    if (table.status !== "seated") await saveTable({ ...table, status: "seated" });
    return;
  }
  // Nobody's seated here per the bookings — free the table, unless an open
  // dine-in check still holds it (a POS walk-in the reservations layer can't see).
  if (table.status === "seated") {
    const orders = await getOrders(locationSlug);
    const heldByCheck = orders.some(
      (o) => o.tableId === tableId && !o.simulated && ORDER_HOLDS_TABLE.has(o.status),
    );
    if (!heldByCheck) await saveTable({ ...table, status: "available" });
  }
}

/**
 * Seat → check. Seating a booking opens a dine-in POS tab on its table (tagged
 * with the guest), so "the check is open where the party is" the moment they sit
 * (concept 5, phase 1). Idempotent: skips if the table already has an active tab.
 */
async function openTableCheck(
  locationSlug: string,
  tableId: string,
  res: { customerName: string; customerPhone?: string; partySize: number },
): Promise<void> {
  const tabs = await getPosTabs(locationSlug);
  if (tabs.some((t) => t.tableId === tableId)) return; // a check already exists here
  await savePosTab({
    locationSlug,
    name: res.customerName || "Dine-in",
    channel: "dine-in",
    status: "open",
    tableId,
    covers: res.partySize,
    customerName: res.customerName || undefined,
    customerPhone: res.customerPhone,
  });
}

/** When a party leaves without ordering, don't strand the auto-opened empty tab. */
async function clearEmptyTableCheck(locationSlug: string, tableId: string): Promise<void> {
  const tabs = await getPosTabs(locationSlug);
  const empty = tabs.find((t) => t.tableId === tableId && (t.items?.length ?? 0) === 0 && !t.sentKds && !t.orderId);
  if (empty) await deletePosTab(empty.id, locationSlug);
}

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
    let durationMin = Number.isFinite(Number(body.durationMin)) ? Math.round(Number(body.durationMin)) : 90;

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
    const source: "booking" | "walk-in" | undefined =
      body.source === "walk-in" ? "walk-in" : body.source === "booking" ? "booking" : undefined;
    // Lifecycle stamps: seatedAt starts the live occupancy; completedAt closes it
    // (with seatedAt, one realised turn the learned model reads). Honour a stamp
    // the client sends; else auto-stamp on the transition so it's never lost.
    const nowIso = new Date().toISOString();
    const seatedAt = body.seatedAt ? String(body.seatedAt) : status === "seated" ? nowIso : undefined;
    const completedAt = body.completedAt ? String(body.completedAt) : status === "completed" ? nowIso : undefined;
    const needsList = Array.isArray(body.needs)
      ? (body.needs.filter((n: unknown) => TABLE_FEATURES.includes(n as TableFeature)) as TableFeature[]).slice(0, 3)
      : [];
    const needs = needsList.length ? needsList : undefined;
    const joinedList = Array.isArray(body.joinedTableIds)
      ? (body.joinedTableIds.filter((t: unknown) => typeof t === "string" && t) as string[]).filter((t) => t !== tableId).slice(0, 4)
      : [];
    const joinedTableIds = joinedList.length ? joinedList : undefined;

    const sameDay = await getReservations(locationSlug, date);
    // The prior state of this booking (if it's an update) — its table (for a
    // reassignment that must free the old one) and status (to detect the seat/
    // clear transition that opens/closes the check).
    const priorRes = typeof body.id === "string" ? sameDay.find((r) => r.id === body.id) : undefined;
    const priorTableId = priorRes?.tableId;
    const priorStatus = priorRes?.status;

    // Service-window gate — a booking / walk-in must be seated inside opening
    // hours: not before open, not after last seating (close − 30 min). Applied
    // whenever the seating TIME is new or changed (a fresh record, or an edit
    // that reschedules), so an out-of-hours reschedule can't slip past by
    // carrying an existing id. Seating / completing / cancelling / re-tabling an
    // existing booking keeps its original time (`timeChanged` false), so a legacy
    // out-of-window record stays actionable. Independent of `override` (you can't
    // seat while closed). A late seating is capped so its table frees by close (a
    // 22:30 walk-in gets a 30-min table).
    const startMin = timeToMinutes(time);
    const timeChanged = !priorRes || priorRes.time !== time;
    if (timeChanged) {
      const win = await getServiceWindow(locationSlug, date);
      const violation = serviceWindowViolation(startMin, win.openMin, win.lastSeatingMin);
      if (violation) {
        const message =
          violation === "before_open"
            ? `The floor doesn't open until ${minutesToTime(win.openMin)}.`
            : `Too late — the last seating is ${minutesToTime(win.lastSeatingMin)} (30 min before ${minutesToTime(win.closeMin)} close).`;
        return NextResponse.json({ error: violation, message }, { status: 422 });
      }
      durationMin = durationBeforeClose(startMin, durationMin, win.closeMin);
    }

    // Conflict check against the day's active bookings on the same table.
    const candidate = {
      id: typeof body.id === "string" ? body.id : "",
      locationSlug,
      tableId,
      date,
      time,
      durationMin,
    };
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
      source,
      seatedAt,
      completedAt,
      needs,
      joinedTableIds,
    });
    // Mirror the live seat/clear onto the shared floor table (TableSession
    // spine). Reconcile the current table and — on a reassignment — the table
    // it moved off, so no ghost stays seated. Best-effort: a floor write must
    // never fail a saved booking.
    const toReconcile = new Set<string>();
    if (tableId) toReconcile.add(tableId);
    if (priorTableId && priorTableId !== tableId) toReconcile.add(priorTableId);
    // Joined tables (current + the ones this booking held before this write) so a
    // combined big party seats/frees every table together.
    for (const tid of joinedTableIds ?? []) toReconcile.add(tid);
    for (const tid of priorRes?.joinedTableIds ?? []) toReconcile.add(tid);
    for (const tid of toReconcile) {
      try {
        await reconcileFloorTable(locationSlug, tid, date);
      } catch {
        /* non-fatal: the booking is saved; floor status self-heals on next write */
      }
    }

    // Seat → check: opening a dine-in tab when the party sits, clearing an empty
    // one when they leave without ordering. Best-effort, on the transition only.
    if (tableId) {
      try {
        if (status === "seated" && priorStatus !== "seated") {
          // one check on the primary table (a joined party shares it)
          await openTableCheck(locationSlug, tableId, { customerName, customerPhone: reservation.customerPhone, partySize: Math.round(partySize) });
        } else if (priorStatus === "seated" && (status === "completed" || status === "cancelled" || status === "no-show")) {
          for (const tid of [tableId, ...(joinedTableIds ?? [])]) await clearEmptyTableCheck(locationSlug, tid);
        }
      } catch {
        /* non-fatal — the booking is saved regardless of the check */
      }
    }
    return NextResponse.json({ reservation, conflicts });
  },
);

export const DELETE = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // Capture the table before the record's gone, so a cancelled seated party
    // frees its floor table (TableSession spine).
    const doomed = locationSlug ? (await getReservations(locationSlug)).find((r) => r.id === id) : undefined;
    const ok = await deleteReservation(id, locationSlug ?? undefined);
    if (ok && locationSlug && doomed) {
      const tids = [doomed.tableId, ...(doomed.joinedTableIds ?? [])].filter((t): t is string => !!t);
      for (const tid of tids) {
        try {
          await reconcileFloorTable(locationSlug, tid, doomed.date);
        } catch {
          /* non-fatal */
        }
      }
    }
    return NextResponse.json({ ok });
  },
);
