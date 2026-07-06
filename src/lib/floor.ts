import type { Reservation } from "@/data/types";

/**
 * Pure floor / reservation helpers — no I/O, so they're unit-testable and safe
 * to call from both the API route (conflict checks on write) and the client.
 */

/** "HH:MM" → minutes since midnight, or NaN if malformed. */
export function timeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** Do two [start, start+dur) minute windows overlap? Touching edges (one ends
 *  exactly when the next begins) do NOT count as an overlap. */
export function windowsOverlap(
  aStart: number,
  aDur: number,
  bStart: number,
  bDur: number,
): boolean {
  if (![aStart, aDur, bStart, bDur].every(Number.isFinite)) return false;
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

/** Reservation statuses that still hold a table. Cancelled / completed /
 *  no-show bookings free it, so they never clash. */
const HOLDS_TABLE: Reservation["status"][] = ["booked", "seated"];

/** Minutes a table is held AFTER a booking ends before the next party can be
 *  seated: staff need to clear + reset, and a too-tight turn cascades delays.
 *  So two bookings on the same table must sit at least this far apart — a
 *  booking effectively occupies its table for `durationMin + turnaround`. */
export const TABLE_TURNAROUND_MIN = 15;

/**
 * Other active reservations on the same table + date whose time window overlaps
 * `candidate` — i.e. a double-booking OR a turnaround too tight for staff to
 * clean between them (each booking reserves its slot + a 15-min cleanup tail,
 * so back-to-back bookings clash). An unassigned booking (no tableId) can't
 * clash a table, so it returns none.
 */
export function findReservationConflicts(
  all: Reservation[],
  candidate: Pick<
    Reservation,
    "id" | "locationSlug" | "tableId" | "date" | "time" | "durationMin"
  >,
): Reservation[] {
  if (!candidate.tableId) return [];
  const start = timeToMinutes(candidate.time);
  if (!Number.isFinite(start)) return [];
  return all.filter(
    (r) =>
      r.id !== candidate.id &&
      r.tableId != null &&
      r.tableId === candidate.tableId &&
      r.locationSlug === candidate.locationSlug &&
      r.date === candidate.date &&
      HOLDS_TABLE.includes(r.status) &&
      // Each side carries its cleanup tail, so a 15-min gap is required between
      // consecutive bookings, not just non-overlap.
      windowsOverlap(
        start,
        candidate.durationMin + TABLE_TURNAROUND_MIN,
        timeToMinutes(r.time),
        r.durationMin + TABLE_TURNAROUND_MIN,
      ),
  );
}
