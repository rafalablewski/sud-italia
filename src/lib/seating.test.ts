import { test } from "node:test";
import assert from "node:assert/strict";
import type { FloorTable, Reservation } from "@/data/types";
import {
  daypartOf,
  expectedTurnMin,
  freeWindowMin,
  suggestTables,
  recommendTable,
  buildTurnModel,
  turnBucket,
  resolvePolicy,
  suggestJoins,
  simulateService,
  estimateWaitMin,
  summariseDecisions,
  summariseTurnAccuracy,
  dowGroupOf,
  BALANCED_POLICY,
  GUEST_FIRST_POLICY,
  MAXIMISE_COVERS_POLICY,
  type SuggestContext,
  type TurnSample,
} from "./seating";

const LOC = "krakow";
const DATE = "2026-07-07";

function table(id: string, seats: number, zone?: string, status: FloorTable["status"] = "available"): FloorTable {
  return { id, locationSlug: LOC, number: id.replace("t", "T"), seats, zone, status, createdAt: "2026-01-01T00:00:00Z" };
}
function resv(tableId: string, time: string, durationMin = 90, status: Reservation["status"] = "booked"): Reservation {
  return { id: `r-${tableId}-${time}`, locationSlug: LOC, customerName: "X", partySize: 2, date: DATE, time, durationMin, tableId, status } as Reservation;
}

const at = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function ctx(party: number, atMin: number, tables: FloorTable[], reservations: Reservation[] = [], extra: Partial<SuggestContext> = {}): SuggestContext {
  return { party, atMin, date: DATE, locationSlug: LOC, tables, reservations, ...extra };
}

// ── turn-time model ──────────────────────────────────────────────────────────
test("daypartOf splits the service correctly", () => {
  assert.equal(daypartOf(at("12:00")), "lunch");
  assert.equal(daypartOf(at("17:00")), "early");
  assert.equal(daypartOf(at("19:30")), "prime");
  assert.equal(daypartOf(at("22:00")), "late");
});

test("expectedTurnMin grows with party size and peaks at prime", () => {
  assert.ok(expectedTurnMin(6, at("19:30")) > expectedTurnMin(2, at("19:30")));
  assert.ok(expectedTurnMin(4, at("19:30")) > expectedTurnMin(4, at("12:00"))); // prime > lunch
});

// ── free-window ──────────────────────────────────────────────────────────────
test("freeWindowMin = minutes to the next hold, Infinity when none", () => {
  const rs = [resv("t1", "20:00")];
  assert.equal(freeWindowMin("t1", at("18:58"), DATE, LOC, rs), at("20:00") - at("18:58"));
  assert.equal(freeWindowMin("t2", at("18:58"), DATE, LOC, rs), Infinity);
});

test("freeWindowMin ignores past holds and the excluded reservation", () => {
  const rs = [resv("t1", "17:00"), resv("t1", "20:00")];
  assert.equal(freeWindowMin("t1", at("18:58"), DATE, LOC, rs), at("20:00") - at("18:58")); // 17:00 is behind us
  assert.equal(freeWindowMin("t1", at("18:58"), DATE, LOC, rs, "r-t1-20:00"), Infinity); // excluded its own hold
});

test("freeWindowMin skips cancelled / no-show holds", () => {
  const rs = [resv("t1", "20:00", 90, "cancelled"), resv("t1", "21:00", 90, "no-show")];
  assert.equal(freeWindowMin("t1", at("18:58"), DATE, LOC, rs), Infinity);
});

// ── hard constraints ─────────────────────────────────────────────────────────
test("too-small tables are excluded, not scored", () => {
  const res = suggestTables(ctx(4, at("18:58"), [table("t1", 2), table("t2", 4)]));
  const t1 = res.find((s) => s.tableId === "t1")!;
  const t2 = res.find((s) => s.tableId === "t2")!;
  assert.equal(t1.ok, false);
  assert.equal(t1.excludedReason, "too small");
  assert.equal(t2.ok, true);
});

test("out-of-service tables are excluded", () => {
  const res = suggestTables(ctx(2, at("18:58"), [table("t1", 2, undefined, "out-of-service")]));
  assert.equal(res[0].ok, false);
  assert.equal(res[0].excludedReason, "out of service");
});

test("walk-in guard: a table reserved within the turn window is excluded (held)", () => {
  // party of 4 at 18:58 needs ~95+10 min; a 19:30 booking leaves only 32m → held
  const res = suggestTables(ctx(4, at("18:58"), [table("t7", 6, "window")], [resv("t7", "19:30")]));
  assert.equal(res[0].ok, false);
  assert.ok(res[0].excludedReason?.startsWith("held"));
});

test("a table occupied RIGHT NOW is excluded (not just future holds)", () => {
  // a party seated at 18:00 for 90m occupies T1 until 19:30; at 19:00 it's busy
  const seated = resv("t1", "18:00", 90, "seated");
  const res = suggestTables(ctx(2, at("19:00"), [table("t1", 2)], [seated]));
  assert.equal(res[0].ok, false);
  assert.ok(res[0].excludedReason?.startsWith("occupied"), `got ${res[0].excludedReason}`);
});

test("a table free for the whole turn passes and is recommended", () => {
  const res = suggestTables(ctx(4, at("18:58"), [table("t11", 4, "main")]));
  assert.equal(res[0].ok, true);
  assert.equal(res[0].isRecommended, true);
  assert.equal(res[0].freeWindowMin, Infinity);
});

// ── scoring / ranking ────────────────────────────────────────────────────────
test("exact fit outranks an oversized table", () => {
  const res = suggestTables(ctx(4, at("18:58"), [table("t9", 8, "booth"), table("t11", 4, "main")]));
  assert.equal(res[0].tableId, "t11"); // 4-top beats 8-top for a party of 4
  assert.ok(res[0].score > res[1].score);
});

test("yield: a large table is held back from a small party even when it fits", () => {
  // party of 2, both fit; the 4-top should win over the 8-top on yield
  const res = suggestTables(ctx(2, at("19:30"), [table("t9", 8), table("t6", 4)]));
  assert.equal(res[0].tableId, "t6");
});

test("guest preference boosts the matching zone", () => {
  const tables = [table("t6", 4, "main"), table("t2", 4, "window")];
  const withoutPref = suggestTables(ctx(4, at("18:58"), tables));
  // tie-ish without prefs; with a window preference, the window table must win
  const withPref = suggestTables(ctx(4, at("18:58"), tables, [], { prefs: { zone: "window" } }));
  assert.equal(withPref[0].zone, "window");
  assert.ok(withPref.find((s) => s.zone === "window")!.breakdown.guest >= withoutPref.find((s) => s.zone === "window")!.breakdown.guest);
});

test("every suggestion is explainable (reasons + breakdown that sums to score)", () => {
  const s = suggestTables(ctx(4, at("18:58"), [table("t11", 4, "window")]))[0];
  assert.ok(s.reasons.length > 0);
  const b = s.breakdown;
  const sum = b.fit + b.runway + b.guest + b.pacing + b.yield + b.section;
  assert.ok(Math.abs(sum - s.score) < 1); // rounding tolerance
});

test("section balance steers covers toward the lighter server station", () => {
  // window zone is already loaded with covers; main is empty. Two equal 4-tops,
  // one per zone → the main (lighter) one should out-score on section.
  const tables = [table("t2", 4, "window"), table("t6", 4, "main")];
  const loaded = [resv("t8", "19:00"), resv("t9", "19:00")].map((r) => ({ ...r, tableId: r.tableId, partySize: 6 })) as Reservation[];
  // put the load on window by giving those reservations window-zone tables
  const winTables = [...tables, table("t8", 6, "window"), table("t9", 6, "window")];
  const res = suggestTables(ctx(4, at("18:58"), winTables, loaded, {}));
  const main = res.find((s) => s.zone === "main")!;
  const win = res.find((s) => s.tableId === "t2")!;
  assert.ok(main.breakdown.section > win.breakdown.section, `main ${main.breakdown.section} vs window ${win.breakdown.section}`);
});

test("suggestions carry confidence, a turn band, and a frees-at time", () => {
  const s = suggestTables(ctx(2, at("19:00"), [table("t1", 2)]))[0];
  assert.ok(s.confidence > 0 && s.confidence <= 1);
  assert.ok(s.turnBandMin >= 6);
  assert.equal(s.freesAtMin, at("19:00") + s.expectedTurnMin + 10); // + reset buffer
});

test("confidence rises with learned sample size", () => {
  const thin = buildTurnModel([{ party: 2, atMin: at("19:00"), minutes: 80 }]);
  const thick = buildTurnModel(Array.from({ length: 40 }, () => ({ party: 2, atMin: at("19:00"), minutes: 80 })));
  const cThin = suggestTables(ctx(2, at("19:00"), [table("t1", 2)], [], { turnModel: thin }))[0].confidence;
  const cThick = suggestTables(ctx(2, at("19:00"), [table("t1", 2)], [], { turnModel: thick }))[0].confidence;
  assert.ok(cThick > cThin);
});

test("ok tables sort before excluded ones", () => {
  const res = suggestTables(ctx(4, at("18:58"), [table("t1", 2), table("t11", 4)]));
  const firstExcluded = res.findIndex((s) => !s.ok);
  const lastOk = res.map((s) => s.ok).lastIndexOf(true);
  assert.ok(lastOk < firstExcluded);
});

// ── policy ───────────────────────────────────────────────────────────────────
test("policy changes the ranking (guest-first lifts preference)", () => {
  const tables = [table("t6", 4, "main"), table("t2", 4, "window")];
  const prefs = { zone: "window" as const };
  const balanced = suggestTables(ctx(4, at("18:58"), tables, [], { prefs }))[0];
  const guestFirst = suggestTables(ctx(4, at("18:58"), tables, [], { prefs, policy: GUEST_FIRST_POLICY }))[0];
  assert.equal(guestFirst.zone, "window");
  // guest signal carries more of the score under guest-first
  assert.ok(guestFirst.breakdown.guest > balanced.breakdown.guest);
});

test("maximise-covers still respects hard constraints", () => {
  const res = suggestTables(ctx(4, at("18:58"), [table("t1", 2)], [], { policy: MAXIMISE_COVERS_POLICY }));
  assert.equal(res[0].ok, false); // a 2-top can never hold 4, whatever the policy
});

// ── learned turn-times ───────────────────────────────────────────────────────
test("turnBucket maps party size to the learning bucket", () => {
  assert.equal(turnBucket(2), "1-2");
  assert.equal(turnBucket(4), "3-4");
  assert.equal(turnBucket(6), "5-6");
  assert.equal(turnBucket(10), "7+");
});

test("buildTurnModel shrinks thin data toward the default, trusts thick data", () => {
  const prime = at("19:30");
  // one long 2-top sample → shrinks toward the 88-min prime default (barely moves)
  const dflt = expectedTurnMin(2, prime); // no model
  const thin = buildTurnModel([{ party: 2, atMin: prime, minutes: 140 }]);
  const thinMean = expectedTurnMin(2, prime, thin);
  assert.ok(thinMean > dflt && thinMean < 120, `expected a small nudge above ${dflt}, got ${thinMean}`);
  // many consistent samples → moves close to the observed mean
  const many: TurnSample[] = Array.from({ length: 40 }, () => ({ party: 2, atMin: prime, minutes: 140 }));
  const thick = expectedTurnMin(2, prime, buildTurnModel(many));
  assert.ok(thick > 130, `expected to trust the data, got ${thick}`);
});

test("buildTurnModel ignores impossible durations", () => {
  const m = buildTurnModel([{ party: 4, atMin: at("19:30"), minutes: -5 }, { party: 4, atMin: at("19:30"), minutes: 999 }]);
  assert.equal(Object.keys(m.cells).length, 0);
  assert.equal(expectedTurnMin(4, at("19:30"), m), expectedTurnMin(4, at("19:30"))); // falls back to default
});

test("a learned longer turn tightens the walk-in guard", () => {
  // T2 has a 20:45 booking; a party of 2 at 18:58 with default turn fits...
  const tables = [table("t2", 2)];
  const rs = [resv("t2", "20:45")];
  const withDefault = suggestTables(ctx(2, at("18:58"), tables, rs));
  assert.equal(withDefault[0].ok, true);
  // ...but once we've learned 2-tops linger ~150m at prime, the same table is held
  const model = buildTurnModel(Array.from({ length: 30 }, () => ({ party: 2, atMin: at("19:30"), minutes: 150 })));
  const withModel = suggestTables(ctx(2, at("18:58"), tables, rs, { turnModel: model }));
  assert.equal(withModel[0].ok, false);
  assert.ok(withModel[0].excludedReason?.startsWith("held"));
});

// ── accessibility ─────────────────────────────────────────────────────────────
test("a required feature the table lacks is a hard exclusion", () => {
  const plain = table("t1", 4, "main");
  const access: FloorTable = { ...table("t2", 4, "main"), features: ["accessible", "step-free"] };
  const res = suggestTables({ party: 2, atMin: at("19:00"), date: DATE, locationSlug: LOC, tables: [plain, access], reservations: [], needs: ["accessible"] });
  const t1 = res.find((s) => s.tableId === "t1")!;
  const t2 = res.find((s) => s.tableId === "t2")!;
  assert.equal(t1.ok, false);
  assert.ok(t1.excludedReason?.startsWith("no accessible"));
  assert.equal(t2.ok, true); // has the feature
});

test("no needs → features are ignored (non-regressing)", () => {
  const plain = table("t1", 4, "main");
  const res = suggestTables({ party: 2, atMin: at("19:00"), date: DATE, locationSlug: LOC, tables: [plain], reservations: [] });
  assert.equal(res[0].ok, true);
});

// ── advanced policy: section cap · VIP hold · protect large ──────────────────
test("section cap: a zone at its per-15-min cap is excluded, other zones pass", () => {
  const policy = { ...BALANCED_POLICY, sectionCapPer15: 1 };
  // a patio hold at 18:50 fills patio's one slot for the 18:45 bucket
  const tables = [table("t2", 4, "patio"), table("t3", 4, "patio"), table("t5", 4, "main")];
  const rs = [resv("t2", "18:50")]; // occupies t2 AND counts as patio's 1 hold this bucket
  const res = suggestTables(ctx(4, at("18:58"), tables, rs, { policy }));
  const t3 = res.find((s) => s.tableId === "t3")!;
  const t5 = res.find((s) => s.tableId === "t5")!;
  assert.equal(t3.ok, false);
  assert.ok(t3.excludedReason?.includes("full this window"), `got ${t3.excludedReason}`);
  assert.equal(t5.ok, true); // main zone untouched
});

test("VIP hold: a non-VIP is excluded from a held zone; a VIP is let in", () => {
  const policy = { ...BALANCED_POLICY, vipHoldZones: ["window"] };
  const tables = [table("t2", 4, "window")];
  const nonVip = suggestTables(ctx(4, at("18:58"), tables, [], { policy }));
  assert.equal(nonVip[0].ok, false);
  assert.equal(nonVip[0].excludedReason, "VIP hold");
  const vip = suggestTables(ctx(4, at("18:58"), tables, [], { policy, prefs: { vip: true } }));
  assert.equal(vip[0].ok, true);
});

test("protect large tables: a small party is dropped from a big top when a small one is free", () => {
  const policy = { ...BALANCED_POLICY, protectLargeTables: true, largeTableSeats: 6, protectLargeReleaseMin: 0 };
  const res = suggestTables(ctx(2, at("18:58"), [table("t6", 4, "main"), table("t9", 8, "booth")], [], { policy }));
  const t9 = res.find((s) => s.tableId === "t9")!;
  const t6 = res.find((s) => s.tableId === "t6")!;
  assert.equal(t9.ok, false);
  assert.ok(t9.excludedReason?.includes("protected"), `got ${t9.excludedReason}`);
  assert.equal(t6.ok, true);
});

test("protect large tables never strands a party: only a big top fits → still seatable", () => {
  const policy = { ...BALANCED_POLICY, protectLargeTables: true, largeTableSeats: 6 };
  const res = suggestTables(ctx(2, at("18:58"), [table("t9", 8, "booth")], [], { policy }));
  assert.equal(res[0].ok, true); // nothing smaller to fall back to
});

test("advanced toggles default off/neutral so a bare preset never regresses ranking", () => {
  const p = resolvePolicy({ preset: "balanced" });
  assert.equal(p.sectionCapPer15, 0);
  assert.equal(p.protectLargeTables, false);
  assert.deepEqual(p.vipHoldZones, []);
  // overrides flow through resolve
  const o = resolvePolicy({ preset: "balanced", overrides: { sectionCapPer15: 3, vipHoldZones: ["patio"], shadowMode: true } });
  assert.equal(o.sectionCapPer15, 3);
  assert.deepEqual(o.vipHoldZones, ["patio"]);
  assert.equal(o.shadowMode, true);
});

// ── table joins ───────────────────────────────────────────────────────────────
test("suggestJoins combines the fewest same-zone tables to fit a big party", () => {
  // party of 7, no single fits; two 4-tops in 'main' combine to 8
  const tables = [table("t5", 4, "main"), table("t6", 4, "main"), table("t2", 2, "window")];
  const joins = suggestJoins(ctx(7, at("18:58"), tables));
  assert.ok(joins.length >= 1);
  assert.deepEqual(joins[0].tableIds.sort(), ["t5", "t6"]);
  assert.equal(joins[0].seats, 8);
  assert.equal(joins[0].zone, "main");
});

test("suggestJoins returns nothing when a single table already fits", () => {
  const joins = suggestJoins(ctx(4, at("18:58"), [table("t6", 4, "main"), table("t5", 4, "main")]));
  assert.equal(joins.length, 0);
});

test("suggestJoins won't combine across zones (adjacency proxy)", () => {
  // 4 + 4 but in different zones → no single zone reaches 7
  const tables = [table("t5", 4, "main"), table("t2", 4, "window")];
  const joins = suggestJoins(ctx(7, at("18:58"), tables));
  assert.equal(joins.length, 0);
});

test("suggestJoins skips occupied / held tables", () => {
  const tables = [table("t5", 4, "main"), table("t6", 4, "main")];
  const rs = [resv("t6", "18:00", 90, "seated")]; // t6 busy now
  const joins = suggestJoins(ctx(7, at("18:58"), tables, rs));
  assert.equal(joins.length, 0); // only t5 free → can't reach 7
});

// ── look-ahead ────────────────────────────────────────────────────────────────
test("look-ahead holds a table a known later party will need", () => {
  const tables = [table("t6", 4, "main"), table("t9", 8, "main")];
  const baseT9 = suggestTables(ctx(4, at("18:58"), tables)).find((s) => s.tableId === "t9")!;
  // a later booking of 8 (needs most of the 8-top) → t9 should be held harder
  const later: Reservation[] = [{ id: "later", locationSlug: LOC, customerName: "Michalski", partySize: 8, date: DATE, time: "20:00", durationMin: 120, status: "booked" } as Reservation];
  const res = suggestTables(ctx(4, at("18:58"), tables, later));
  const t9 = res.find((s) => s.tableId === "t9")!;
  const t6 = res.find((s) => s.tableId === "t6")!;
  assert.ok(t9.breakdown.yield < baseT9.breakdown.yield, "later demand lowers the big table's yield");
  assert.ok(t6.score > t9.score, "the smaller table is now preferred for the small party");
  assert.ok(t9.reasons.some((r) => r.includes("needed for a 8")), `got ${t9.reasons.join(",")}`);
});

// ── pre-service simulation ────────────────────────────────────────────────────
function resvFull(id: string, time: string, party: number, tableId: string | undefined, status: Reservation["status"] = "booked"): Reservation {
  return { id, locationSlug: LOC, customerName: id, partySize: party, date: DATE, time, durationMin: 90, tableId, status } as Reservation;
}
test("simulateService counts covers + occupancy and flags at-risk bookings", () => {
  const tables = [table("t1", 2, "main"), table("t2", 4, "main")];
  const rs = [
    resvFull("a", "19:00", 2, "t1"), // fine
    resvFull("b", "19:00", 6, "t2"), // 6 on a 4-top → too small
    resvFull("c", "20:00", 2, undefined), // no table
  ];
  const sim = simulateService({ tables, reservations: rs, date: DATE, locationSlug: LOC });
  assert.equal(sim.bookings, 3);
  assert.equal(sim.covers, 10);
  assert.equal(sim.serviceableTables, 2);
  assert.ok(sim.atRisk.find((a) => a.id === "b" && a.reason === "table too small"));
  assert.ok(sim.atRisk.find((a) => a.id === "c" && a.reason === "no table"));
  assert.ok(sim.peakOccupancyPct > 0);
});

test("simulateService clears a joined big party as seatable (not too small)", () => {
  const tables = [table("t5", 4, "main"), table("t6", 4, "main")];
  const joined: Reservation = { ...resvFull("j", "19:00", 7, "t5"), joinedTableIds: ["t6"] } as Reservation;
  const sim = simulateService({ tables, reservations: [joined], date: DATE, locationSlug: LOC });
  assert.equal(sim.atRisk.length, 0); // 4 + 4 seats ≥ 7
});

// ── waitlist quote ────────────────────────────────────────────────────────────
test("estimateWaitMin: 0 when a fitting table is free now", () => {
  const q = estimateWaitMin({ party: 2, atMin: at("19:00"), date: DATE, locationSlug: LOC, tables: [table("t1", 2)], reservations: [], aheadCount: 0 });
  assert.equal(q, 0);
});

test("estimateWaitMin: waits for the remaining turn + reset when all fitting tables are busy", () => {
  const seated = resv("t1", "18:00", 90, "seated"); // frees at 19:30
  const q = estimateWaitMin({ party: 2, atMin: at("19:00"), date: DATE, locationSlug: LOC, tables: [table("t1", 2)], reservations: [seated], aheadCount: 0 });
  assert.equal(q, 30 + 10); // 30m left + 10m reset buffer
});

test("estimateWaitMin: parties ahead push the quote out", () => {
  const t = [table("t1", 2), table("t2", 2)]; // two free tables
  const first = estimateWaitMin({ party: 2, atMin: at("19:00"), date: DATE, locationSlug: LOC, tables: t, reservations: [], aheadCount: 0 });
  const third = estimateWaitMin({ party: 2, atMin: at("19:00"), date: DATE, locationSlug: LOC, tables: t, reservations: [], aheadCount: 2 });
  assert.equal(first, 0);
  assert.ok((third ?? 0) > 0); // 2 ahead, only 2 tables → 3rd waits a turn
});

test("estimateWaitMin: null when no table can ever seat the party", () => {
  const q = estimateWaitMin({ party: 8, atMin: at("19:00"), date: DATE, locationSlug: LOC, tables: [table("t1", 2)], reservations: [], aheadCount: 0 });
  assert.equal(q, null);
});

// ── timed holds ───────────────────────────────────────────────────────────────
test("reserved-table grace keeps a late guest's table held past its slot", () => {
  // booking 18:00–19:30; at 19:35 it's nominally over, but a 15m grace holds it
  const rs = [resv("t1", "18:00", 90, "booked")];
  const graceOn = { ...BALANCED_POLICY, reservedGraceMin: 15 };
  const graceOff = { ...BALANCED_POLICY, reservedGraceMin: 0 };
  const held = suggestTables(ctx(2, at("19:35"), [table("t1", 2)], rs, { policy: graceOn }));
  const free = suggestTables(ctx(2, at("19:35"), [table("t1", 2)], rs, { policy: graceOff }));
  assert.equal(held[0].ok, false);
  assert.ok(held[0].excludedReason?.startsWith("occupied"));
  assert.equal(free[0].ok, true); // without grace the slot is over → free
});

test("timed protect-large lifts when no big demand is coming", () => {
  const tables = [table("t6", 4, "main"), table("t9", 8, "main")];
  const blanket = { ...BALANCED_POLICY, protectLargeTables: true, largeTableSeats: 6, protectLargeReleaseMin: 0 };
  const timed = { ...BALANCED_POLICY, protectLargeTables: true, largeTableSeats: 6, protectLargeReleaseMin: 30 };
  // no later big booking → blanket still protects, timed lifts
  const b = suggestTables(ctx(2, at("18:58"), tables, [], { policy: blanket })).find((s) => s.tableId === "t9")!;
  const t = suggestTables(ctx(2, at("18:58"), tables, [], { policy: timed })).find((s) => s.tableId === "t9")!;
  assert.equal(b.ok, false); // blanket protection
  assert.equal(t.ok, true); // timed release — no big demand, so the 8-top is usable
});

test("timed protect-large still holds when big demand is far off", () => {
  const tables = [table("t6", 4, "main"), table("t9", 8, "main")];
  const timed = { ...BALANCED_POLICY, protectLargeTables: true, largeTableSeats: 6, protectLargeReleaseMin: 30 };
  const later: Reservation[] = [{ id: "big", locationSlug: LOC, customerName: "Party", partySize: 8, date: DATE, time: "20:30", durationMin: 120, status: "booked" } as Reservation];
  const t = suggestTables(ctx(2, at("18:58"), tables, later, { policy: timed })).find((s) => s.tableId === "t9")!;
  assert.equal(t.ok, false); // 90m out (> 30m release) → still protected
});

// ── turn-time accuracy ────────────────────────────────────────────────────────
test("summariseTurnAccuracy reports error, bias and within-band share", () => {
  const prime = at("19:30");
  // model trained to ~140; realised turns all 140 → tiny error, high within-band
  const trained = buildTurnModel(Array.from({ length: 40 }, () => ({ party: 2, atMin: prime, minutes: 140, dow: 2 })));
  const samples: TurnSample[] = Array.from({ length: 10 }, () => ({ party: 2, atMin: prime, minutes: 140, dow: 2 }));
  const acc = summariseTurnAccuracy(samples, trained);
  assert.equal(acc.n, 10);
  assert.ok(acc.maeMin <= 5);
  assert.ok(acc.withinBandPct >= 90);
});

test("summariseTurnAccuracy shows positive bias when parties linger beyond the default", () => {
  const prime = at("19:30");
  // no model → default ~88 for a 2-top prime; realised 130 → parties linger
  const samples: TurnSample[] = Array.from({ length: 8 }, () => ({ party: 2, atMin: prime, minutes: 130 }));
  const acc = summariseTurnAccuracy(samples);
  assert.ok(acc.biasMin > 20, `expected a clear positive bias, got ${acc.biasMin}`);
});

// ── weekday turn-time learning ────────────────────────────────────────────────
test("dowGroupOf splits Fri/Sat from the rest of the week", () => {
  assert.equal(dowGroupOf(5), "we"); // Friday
  assert.equal(dowGroupOf(6), "we"); // Saturday
  assert.equal(dowGroupOf(2), "wd"); // Tuesday
  assert.equal(dowGroupOf(undefined), "wd");
});

test("turn model learns weekday and weekend cells separately", () => {
  const prime = at("19:30");
  const samples: TurnSample[] = [
    ...Array.from({ length: 30 }, () => ({ party: 2, atMin: prime, minutes: 80, dow: 2 })), // Tue: quick
    ...Array.from({ length: 30 }, () => ({ party: 2, atMin: prime, minutes: 140, dow: 6 })), // Sat: lingering
  ];
  const model = buildTurnModel(samples);
  const wd = expectedTurnMin(2, prime, model, 2); // Tuesday
  const we = expectedTurnMin(2, prime, model, 6); // Saturday
  assert.ok(we > wd + 30, `weekend ${we} should be well above weekday ${wd}`);
});

// ── trust loop summary ────────────────────────────────────────────────────────
function decision(over: boolean, reason?: "guest-request" | "server-balance" | "large-party" | "vip" | "other", topSignal?: "fit" | "runway" | "guest" | "pacing" | "yield" | "section") {
  return { id: "d", locationSlug: LOC, at: "2026-07-07T19:00:00Z", party: 2, atMin: 1140, recommendedTableId: "a", chosenTableId: over ? "b" : "a", override: over, shadow: false, reason, topSignal };
}
test("summariseDecisions surfaces the top override reason + a signal nudge", () => {
  const decisions = [
    decision(false),
    decision(true, "guest-request", "yield"),
    decision(true, "guest-request", "yield"),
    decision(true, "server-balance", "yield"),
    decision(true, "guest-request", "fit"),
  ];
  const s = summariseDecisions(decisions);
  assert.equal(s.n, 5);
  assert.equal(s.overrides, 4);
  assert.equal(s.topReason?.reason, "guest-request");
  assert.equal(s.topReason?.count, 3);
  // yield is the top signal on 3 of 4 overrides (≥3, ≥40%) → nudge fires
  assert.equal(s.nudge?.signal, "yield");
  assert.equal(s.nudge?.overrides, 3);
});

test("summariseDecisions gives no nudge when overrides are diffuse", () => {
  const s = summariseDecisions([decision(true, "other", "fit"), decision(true, "other", "guest")]);
  assert.equal(s.nudge, null);
});

// ── recommendTable ───────────────────────────────────────────────────────────
test("recommendTable returns the top ok table, or null when nothing fits", () => {
  assert.equal(recommendTable(ctx(4, at("18:58"), [table("t11", 4)]))!.tableId, "t11");
  assert.equal(recommendTable(ctx(8, at("18:58"), [table("t1", 2), table("t6", 4)])), null);
});
