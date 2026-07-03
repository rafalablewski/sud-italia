import { test } from "node:test";
import assert from "node:assert/strict";
import type { FloorTable, Reservation } from "@/data/types";
import { buildTableSessions, type TableSession } from "./table-session";

const LOC = "krakow";
const DATE = "2026-07-07";

function table(id: string, seats: number, status: FloorTable["status"] = "available"): FloorTable {
  return { id, locationSlug: LOC, number: id.replace("t", "T"), seats, status, createdAt: "2026-01-01T00:00:00Z" };
}
function resv(tableId: string, time: string, status: Reservation["status"], extra: Partial<Reservation> = {}): Reservation {
  return {
    id: `r-${tableId}-${time}-${status}`, locationSlug: LOC, customerName: "Guest", partySize: 2,
    date: DATE, time, durationMin: 90, tableId, status, ...extra,
  } as Reservation;
}
const at = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
function build(tables: FloorTable[], reservations: Reservation[], nowMin: number): TableSession[] {
  return buildTableSessions({ tables, reservations, nowMin, date: DATE, locationSlug: LOC });
}
const byId = (ss: TableSession[], id: string) => ss.find((s) => s.table.id === id)!;

test("a seated booking whose window straddles now → seated, with elapsed + source", () => {
  const s = byId(build([table("t1", 2)], [resv("t1", "19:00", "seated")], at("19:20")), "t1");
  assert.equal(s.state, "seated");
  assert.equal(s.seatedMin, 20);
  assert.equal(s.source, "booking");
  assert.equal(s.reservation?.status, "seated");
});

test("a walk-in booking carries its source through", () => {
  const s = byId(build([table("t1", 2)], [resv("t1", "19:00", "seated", { source: "walk-in" })], at("19:10")), "t1");
  assert.equal(s.state, "seated");
  assert.equal(s.source, "walk-in");
});

test("a booking whose time has arrived but nobody sat them → due", () => {
  const s = byId(build([table("t3", 4)], [resv("t3", "19:00", "booked")], at("19:05")), "t3");
  assert.equal(s.state, "due");
  assert.equal(s.reservation?.status, "booked");
  assert.equal(s.seatedMin, null);
});

test("a table the floor marks seated with NO booking → seated off-book (walk-in)", () => {
  // this is the legacy-floor / POS walk-in the bookings layer can't see
  const s = byId(build([table("t5", 2, "seated")], [], at("19:00")), "t5");
  assert.equal(s.state, "seated");
  assert.equal(s.source, "floor");
  assert.equal(s.reservation, null);
  assert.equal(s.seatedMin, null); // unknown start off-book
});

test("a free table with an imminent booking → held, naming the booking", () => {
  const s = byId(build([table("t7", 4)], [resv("t7", "19:30", "booked")], at("19:00")), "t7"); // 30m out
  assert.equal(s.state, "held");
  assert.equal(s.heldBy?.time, "19:30");
});

test("a free table whose next booking is beyond the horizon → free", () => {
  const s = byId(build([table("t7", 4)], [resv("t7", "21:00", "booked")], at("19:00")), "t7"); // 120m out
  assert.equal(s.state, "free");
  assert.equal(s.heldBy, null);
});

test("an out-of-service table → oos regardless of bookings", () => {
  const s = byId(build([table("t9", 2, "out-of-service")], [resv("t9", "19:00", "seated")], at("19:10")), "t9");
  assert.equal(s.state, "oos");
});

test("freeForMin = minutes to the next hold, Infinity when the night is open", () => {
  const [held, open] = build([table("t1", 2), table("t2", 2)], [resv("t1", "20:00", "booked")], at("19:00"));
  assert.equal(held.freeForMin, at("20:00") - at("19:00"));
  assert.equal(open.freeForMin, Infinity);
});

test("completed / cancelled bookings don't occupy the table", () => {
  const rs = [resv("t1", "19:00", "completed"), resv("t1", "19:00", "cancelled")];
  const s = byId(build([table("t1", 2)], rs, at("19:20")), "t1");
  assert.equal(s.state, "free");
});

test("a seated booking outranks a merely-booked overlap on the same table", () => {
  const rs = [resv("t1", "19:00", "booked"), resv("t1", "19:00", "seated")];
  const s = byId(build([table("t1", 2)], rs, at("19:20")), "t1");
  assert.equal(s.state, "seated");
});

test("every table yields exactly one session, in table order", () => {
  const ss = build([table("t1", 2), table("t2", 4), table("t3", 2)], [], at("19:00"));
  assert.deepEqual(ss.map((s) => s.table.id), ["t1", "t2", "t3"]);
});
