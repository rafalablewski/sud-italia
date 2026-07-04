import type { FloorTable, Reservation } from "@/data/types";
import { freeWindowMin } from "./seating";

/**
 * TableSession — the read half of the seating spine. One derived record per
 * table that fuses the two truths the room actually has:
 *
 *   1. Reservations (`Reservation.status` + tableId + time window) — who is
 *      booked, seated, or due here, from Book & Seat.
 *   2. The physical floor (`FloorTable.status`) — a walk-in seated straight
 *      from POS / the Book Floor lens has no reservation, only a seated
 *      table.
 *
 * Feeding both surfaces the SAME derivation is what makes "who's sitting where"
 * agree across lenses. Pure — no I/O, no Date.now (the caller passes `nowMin`),
 * so it is unit-testable and safe to run live in a client render.
 */

export type SessionState =
  | "oos" // out of service
  | "seated" // a party is at the table now
  | "due" // a booking's time has arrived but they're not seated yet
  | "held" // free now, but an upcoming booking is imminent — don't give it away
  | "free"; // open

/** Who put the party at the table. `floor` = seated from the legacy floor with
 *  no matching reservation (a POS/host walk-in the bookings layer can't see). */
export type SessionSource = "booking" | "walk-in" | "floor" | null;

export interface TableSession {
  table: FloorTable;
  state: SessionState;
  /** The booking occupying (or due at) the table now, if any. */
  reservation: Reservation | null;
  /** For a free-but-`held` table, the upcoming booking holding it. */
  heldBy: Reservation | null;
  /** Minutes the party has been seated (nowMin − start). Null when unknown
   *  (a floor walk-in with no seatedAt) or not seated. */
  seatedMin: number | null;
  /** Minutes until the next hold begins; Infinity when the table is open-ended. */
  freeForMin: number;
  source: SessionSource;
}

const DEFAULT_DURATION_MIN = 90;
/** A booking counts as "occupying now" (booked or seated); done/gone don't. */
const LIVE = new Set<Reservation["status"]>(["booked", "seated"]);
/** How soon an upcoming booking flips a free table to `held`. */
const HELD_HORIZON_MIN = 45;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function durOf(r: Reservation): number {
  return r.durationMin || DEFAULT_DURATION_MIN;
}

export interface BuildSessionsInput {
  tables: FloorTable[];
  reservations: Reservation[];
  /** Minutes past midnight "now" (client-supplied so the fn stays pure). */
  nowMin: number;
  date: string;
  locationSlug: string;
}

/**
 * Derive the live session for every table. Reservation truth wins (a seated or
 * due booking names the party); a table the floor marks `seated` with no
 * booking is a walk-in seated off-book; otherwise the table is free, flagged
 * `held` when a booking is imminent.
 */
export function buildTableSessions(input: BuildSessionsInput): TableSession[] {
  const { tables, reservations, nowMin, date, locationSlug } = input;

  return tables.map((table): TableSession => {
    const freeForMin = freeWindowMin(table.id, nowMin, date, locationSlug, reservations);

    if (table.status === "out-of-service") {
      return { table, state: "oos", reservation: null, heldBy: null, seatedMin: null, freeForMin, source: null };
    }

    const here = reservations.filter((r) => r.tableId === table.id && LIVE.has(r.status));
    // The booking whose window straddles "now" — prefer an already-seated one
    // over a merely-booked one when both overlap (an override double-seat).
    const occupying =
      here
        .filter((r) => toMin(r.time) <= nowMin && nowMin < toMin(r.time) + durOf(r))
        .sort((a, b) => (a.status === "seated" ? -1 : 1) - (b.status === "seated" ? -1 : 1))[0] ?? null;

    if (occupying) {
      const start = toMin(occupying.time);
      if (occupying.status === "seated") {
        return {
          table,
          state: "seated",
          reservation: occupying,
          heldBy: null,
          seatedMin: Math.max(0, nowMin - start),
          freeForMin,
          source: occupying.source ?? "booking",
        };
      }
      // Booked, window has started, nobody sat them yet → due.
      return { table, state: "due", reservation: occupying, heldBy: null, seatedMin: null, freeForMin, source: null };
    }

    // No booking here — but the floor may have a walk-in seated off-book.
    if (table.status === "seated") {
      return { table, state: "seated", reservation: null, heldBy: null, seatedMin: null, freeForMin, source: "floor" };
    }

    // Free. Flag it `held` when the next booking is within the horizon so a
    // walk-in isn't dropped onto a table that's about to be claimed.
    const nextHold = here
      .filter((r) => toMin(r.time) > nowMin)
      .sort((a, b) => toMin(a.time) - toMin(b.time))[0] ?? null;
    if (nextHold && toMin(nextHold.time) - nowMin <= HELD_HORIZON_MIN) {
      return { table, state: "held", reservation: null, heldBy: nextHold, seatedMin: null, freeForMin, source: null };
    }
    return { table, state: "free", reservation: null, heldBy: null, seatedMin: null, freeForMin, source: null };
  });
}
