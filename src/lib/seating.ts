import type { FloorTable, Reservation } from "@/data/types";
import { timeToMinutes } from "./floor";

/**
 * Seating Intelligence Engine — the pure brain behind "what's the best table
 * for this party, right now, without hurting the rest of the night?".
 *
 * Design (see tests/sketches/host-06-engine.html):
 *   1. FILTER  — hard constraints (fit, free-for-the-turn, availability). A table
 *                that fails one is out; it is never suggested.
 *   2. SCORE   — surviving tables get a 0–100 weighted score over soft signals
 *                (right-size, runway comfort, guest preference, pacing, yield).
 *   3. EXPLAIN — every result carries its score breakdown + human reasons +
 *                confidence, so a host sees *why* and can trust or override.
 *
 * Pure & deterministic (no I/O, no Date.now) → safe in the client and fully
 * unit-testable. Turn-times start from sensible defaults; a learned model can
 * replace `expectedTurnMin` later without touching callers (concept v3).
 */

// ─── Turn-time model ─────────────────────────────────────────────────────────

export type Daypart = "lunch" | "early" | "prime" | "late";

/** Service daypart from a start time (minutes since midnight). */
export function daypartOf(atMin: number): Daypart {
  if (atMin < 15 * 60) return "lunch"; // …–15:00
  if (atMin < 18 * 60 + 30) return "early"; // 15:00–18:30
  if (atMin < 21 * 60) return "prime"; // 18:30–21:00
  return "late"; // 21:00–
}

const DAYPART_FACTOR: Record<Daypart, number> = { lunch: 0.85, early: 1, prime: 1.15, late: 1 };

/** Base expected dining minutes by party size (before the daypart factor). */
function baseTurnMin(party: number): number {
  if (party <= 2) return 75;
  if (party <= 4) return 95;
  if (party <= 6) return 120;
  return 150;
}

/**
 * Expected dining duration (minutes) for a party at a given time. Defaults now;
 * a learned per-(party × daypart × weekday) model can slot in here later without
 * changing any caller (the engine's single source of turn-time truth).
 */
export function expectedTurnMin(party: number, atMin: number): number {
  const p = Math.max(1, Math.floor(party || 1));
  return Math.round(baseTurnMin(p) * DAYPART_FACTOR[daypartOf(atMin)]);
}

// ─── Policy ──────────────────────────────────────────────────────────────────

export interface SeatingWeights {
  fit: number;
  runway: number;
  guest: number;
  pacing: number;
  /** Inventory protection — keep big tables for big parties. */
  yield: number;
}

export interface SeatingPolicy {
  weights: SeatingWeights;
  /** Bussing / reset minutes added after a turn before the table is "free". */
  resetBufferMin: number;
  /** Max new seatings the room should absorb per 15-minute bucket (pacing). */
  paceCapPer15: number;
  /** A big table (≥ this many seats) is "large" for yield protection. */
  largeTableSeats: number;
}

function normaliseWeights(w: SeatingWeights): SeatingWeights {
  const total = w.fit + w.runway + w.guest + w.pacing + w.yield || 1;
  return { fit: w.fit / total, runway: w.runway / total, guest: w.guest / total, pacing: w.pacing / total, yield: w.yield / total };
}

/** Balanced — the default. Weights auto-normalise, so these are relative. */
export const BALANCED_POLICY: SeatingPolicy = {
  weights: normaliseWeights({ fit: 0.28, runway: 0.22, guest: 0.2, pacing: 0.1, yield: 0.14 }),
  resetBufferMin: 10,
  paceCapPer15: 4,
  largeTableSeats: 6,
};

/** Pack the room — favour tight fit, yield protection and pacing. */
export const MAXIMISE_COVERS_POLICY: SeatingPolicy = {
  ...BALANCED_POLICY,
  weights: normaliseWeights({ fit: 0.34, runway: 0.16, guest: 0.1, pacing: 0.14, yield: 0.26 }),
  paceCapPer15: 5,
};

/** Guest-experience first — favour preference match and comfortable runway. */
export const GUEST_FIRST_POLICY: SeatingPolicy = {
  ...BALANCED_POLICY,
  weights: normaliseWeights({ fit: 0.22, runway: 0.26, guest: 0.34, pacing: 0.06, yield: 0.12 }),
  paceCapPer15: 3,
};

/** Slow night — comfort over yield, relax pacing. */
export const SLOW_NIGHT_POLICY: SeatingPolicy = {
  ...BALANCED_POLICY,
  weights: normaliseWeights({ fit: 0.24, runway: 0.3, guest: 0.28, pacing: 0.04, yield: 0.14 }),
  paceCapPer15: 8,
};

export const POLICY_PRESETS = {
  balanced: BALANCED_POLICY,
  "maximise-covers": MAXIMISE_COVERS_POLICY,
  "guest-first": GUEST_FIRST_POLICY,
  "slow-night": SLOW_NIGHT_POLICY,
} as const;

export type PolicyPreset = keyof typeof POLICY_PRESETS;
export const DEFAULT_POLICY = BALANCED_POLICY;

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface TablePrefs {
  /** Preferred zone (matched case-insensitively against `table.zone`). */
  zone?: string;
  /** Guest is a VIP / regular — nudges toward their comfort. */
  vip?: boolean;
  /** Their usual table id — a strong preference boost when free. */
  usualTableId?: string;
}

// ─── Free-window ─────────────────────────────────────────────────────────────

const HOLDS: Reservation["status"][] = ["booked", "seated"];

/**
 * Minutes from `atMin` until this table's next holding reservation *starts*
 * (`Infinity` if none). This is "how long is the table genuinely free from
 * now?". A reservation ignored via `excludeReservationId` (the one being seated
 * or edited) never counts against its own table.
 */
export function freeWindowMin(
  tableId: string,
  atMin: number,
  date: string,
  locationSlug: string,
  reservations: Reservation[],
  excludeReservationId?: string,
): number {
  let next = Infinity;
  for (const r of reservations) {
    if (r.id === excludeReservationId) continue;
    if (r.tableId !== tableId || r.locationSlug !== locationSlug || r.date !== date) continue;
    if (!HOLDS.includes(r.status)) continue;
    const start = timeToMinutes(r.time);
    if (!Number.isFinite(start) || start < atMin) continue; // past / current holds don't bound the *forward* window
    next = Math.min(next, start - atMin);
  }
  return next;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface SuggestionBreakdown {
  fit: number;
  runway: number;
  guest: number;
  pacing: number;
  yield: number;
}

export interface Suggestion {
  tableId: string;
  number: string;
  seats: number;
  zone?: string;
  /** Passes every hard constraint → safe to suggest. */
  ok: boolean;
  /** 0–100 (only meaningful when `ok`). */
  score: number;
  /** Weighted point contributions per signal (sums to `score` when `ok`). */
  breakdown: SuggestionBreakdown;
  /** Human "why it ranked here" fragments. */
  reasons: string[];
  /** Set when `!ok` — why the table was filtered out. */
  excludedReason?: string;
  freeWindowMin: number;
  expectedTurnMin: number;
  /** The single best `ok` table for this party. */
  isRecommended: boolean;
}

export interface SuggestContext {
  party: number;
  /** Seating start, minutes since midnight. */
  atMin: number;
  date: string;
  locationSlug: string;
  tables: FloorTable[];
  reservations: Reservation[];
  prefs?: TablePrefs;
  policy?: SeatingPolicy;
  /** When re-seating/editing, ignore this reservation's own hold. */
  excludeReservationId?: string;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

function fmtHM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Rank every table for a party at a time. Returns `ok` tables first (best score
 * first), then filtered-out tables (each with an `excludedReason`). The top
 * `ok` result is flagged `isRecommended`.
 */
export function suggestTables(ctx: SuggestContext): Suggestion[] {
  const policy = ctx.policy ?? DEFAULT_POLICY;
  const party = Math.max(1, Math.floor(ctx.party || 1));
  const turn = expectedTurnMin(party, ctx.atMin);
  const needFree = turn + policy.resetBufferMin;
  const prefs = ctx.prefs;

  // pacing context — how many holds already start in this atMin 15-min bucket
  const bucket = Math.floor(ctx.atMin / 15);
  const bucketLoad = ctx.reservations.filter((r) => {
    if (r.id === ctx.excludeReservationId) return false;
    if (r.locationSlug !== ctx.locationSlug || r.date !== ctx.date) return false;
    if (!HOLDS.includes(r.status)) return false;
    const s = timeToMinutes(r.time);
    return Number.isFinite(s) && Math.floor(s / 15) === bucket;
  }).length;
  const pacingScore = clamp01(1 - bucketLoad / Math.max(1, policy.paceCapPer15));

  const out: Suggestion[] = ctx.tables.map((t) => {
    const zone = t.zone;
    const free = freeWindowMin(t.id, ctx.atMin, ctx.date, ctx.locationSlug, ctx.reservations, ctx.excludeReservationId);
    const base: Suggestion = {
      tableId: t.id,
      number: t.number,
      seats: t.seats,
      zone,
      ok: false,
      score: 0,
      breakdown: { fit: 0, runway: 0, guest: 0, pacing: 0, yield: 0 },
      reasons: [],
      freeWindowMin: free,
      expectedTurnMin: turn,
      isRecommended: false,
    };

    // ── hard constraints ───────────────────────────────────────────
    if (t.status === "out-of-service") return { ...base, excludedReason: "out of service" };
    if (t.seats < party) return { ...base, excludedReason: "too small" };
    if (free < needFree) {
      return { ...base, excludedReason: free === Infinity ? "booked" : `held ${Math.round(free)}m` };
    }

    // ── soft sub-scores (0..1) ─────────────────────────────────────
    const over = t.seats - party;
    const fit = clamp01(1 - Math.max(0, over) * 0.18); // exact = 1, decays with oversize
    const runway = free === Infinity ? 1 : clamp01(free / (turn * 1.5 + policy.resetBufferMin));

    let guest = 0.5; // neutral when nothing is known
    const reasons: string[] = [];
    if (prefs) {
      guest = 0.35;
      if (prefs.usualTableId && prefs.usualTableId === t.id) {
        guest += 0.5;
        reasons.push("their usual table");
      }
      if (prefs.zone && zone && zone.toLowerCase().includes(prefs.zone.toLowerCase())) {
        guest += 0.35;
        reasons.push(`${prefs.zone} match`);
      }
      if (prefs.vip) guest += 0.1;
    }
    guest = clamp01(guest);

    // yield — protect a large table from a small party (keep it for big demand)
    const isLarge = t.seats >= policy.largeTableSeats;
    const smallParty = party <= t.seats - 2;
    const yieldS = isLarge && smallParty ? 0.35 : 1;

    const w = policy.weights;
    const breakdown: SuggestionBreakdown = {
      fit: w.fit * fit * 100,
      runway: w.runway * runway * 100,
      guest: w.guest * guest * 100,
      pacing: w.pacing * pacingScore * 100,
      yield: w.yield * yieldS * 100,
    };
    const score = breakdown.fit + breakdown.runway + breakdown.guest + breakdown.pacing + breakdown.yield;

    // human reasons (most salient first)
    if (over === 0) reasons.unshift("exact fit");
    else if (over === 1) reasons.unshift("good fit");
    if (free === Infinity) reasons.push("open all night");
    else reasons.push(`free until ${fmtHM(ctx.atMin + free)}`);
    if (isLarge && smallParty) reasons.push("large table — held back for big parties");
    if (bucketLoad >= policy.paceCapPer15) reasons.push("busy 15-min window");

    return { ...base, ok: true, score: Math.round(score), breakdown, reasons };
  });

  // rank: ok first (score desc), excluded after (stable by input order)
  const oks = out.filter((s) => s.ok).sort((a, b) => b.score - a.score);
  const excluded = out.filter((s) => !s.ok);
  if (oks.length) oks[0].isRecommended = true;
  return [...oks, ...excluded];
}

/** Convenience — the single recommended table for a party, or `null`. */
export function recommendTable(ctx: SuggestContext): Suggestion | null {
  const top = suggestTables(ctx).find((s) => s.ok);
  return top ?? null;
}
