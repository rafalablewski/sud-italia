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

/** How long before close the kitchen stops seating new parties. A booking or
 *  walk-in may still START up to this long before close, but no later — so a
 *  23:00 close with a 30-min buffer means the last seating is 22:30 (a "last
 *  order" that gets whatever time is left before close). */
export const LAST_ORDER_BUFFER_MIN = 30;

/** Mon-first weekday tokens — the hours-table `day` strings ("Mon-Thu", "Sun"). */
const WEEKDAYS_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One opening-hours row from a location: a day token/range + open/close HH:MM. */
export interface ServiceHours {
  day: string;
  open: string;
  close: string;
}

export interface ServiceWindow {
  /** First minute the floor is open — a booking may start no earlier. */
  openMin: number;
  /** Closing minute — every booking must have ended (been cleared) by here. */
  closeMin: number;
  /** Latest minute a booking / walk-in may START (`closeMin − LAST_ORDER_BUFFER_MIN`). */
  lastSeatingMin: number;
}

/**
 * Resolve a location's dine-in service window for a YYYY-MM-DD date from its
 * opening hours. `hours` entries are day tokens or inclusive ranges ("Mon-Thu",
 * "Fri-Sat", "Sun", "Mon-Sun"); the first whose range covers the date's weekday
 * wins. Falls back to 12:00–23:00 when nothing matches (missing/malformed hours
 * or a non-date). `lastSeatingMin` is the last legal START and is floored at
 * `openMin` so a tiny window can't go negative. Pure + client-safe, so the
 * seating grid, the booking gates and the Book timeline all read one window.
 */
export function serviceWindowForDate(
  hours: ServiceHours[] | undefined,
  date: string,
): ServiceWindow {
  const wd = (new Date(`${date}T00:00:00`).getDay() + 6) % 7; // Mon=0 … Sun=6
  let openMin = 12 * 60;
  let closeMin = 23 * 60;
  for (const h of hours ?? []) {
    const parts = h.day.split("-").map((p) => p.trim());
    const start = WEEKDAYS_MON_FIRST.indexOf(parts[0]);
    const end = WEEKDAYS_MON_FIRST.indexOf(parts[parts.length - 1]);
    if (start === -1 || end === -1) continue;
    if (Number.isFinite(wd) && wd >= start && wd <= end) {
      const o = timeToMinutes(h.open);
      const c = timeToMinutes(h.close);
      if (Number.isFinite(o) && Number.isFinite(c) && c > o) {
        openMin = o;
        closeMin = c;
        break;
      }
    }
  }
  return { openMin, closeMin, lastSeatingMin: Math.max(openMin, closeMin - LAST_ORDER_BUFFER_MIN) };
}

/** Clamp a requested duration so a booking ends by close: a late party gets
 *  only the time left in service. A 22:30 start at a 23:00 close yields 30 min.
 *  Never negative. */
export function durationBeforeClose(
  startMin: number,
  requestedMin: number,
  closeMin: number,
): number {
  return Math.max(0, Math.min(requestedMin, closeMin - startMin));
}

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
