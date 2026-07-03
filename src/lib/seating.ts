import type { FloorTable, Reservation, TableFeature } from "@/data/types";
import { timeToMinutes, findReservationConflicts } from "./floor";

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

/** Party-size buckets the turn-time model learns over. */
export type TurnBucket = "1-2" | "3-4" | "5-6" | "7+";
export function turnBucket(party: number): TurnBucket {
  const p = Math.max(1, Math.floor(party || 1));
  if (p <= 2) return "1-2";
  if (p <= 4) return "3-4";
  if (p <= 6) return "5-6";
  return "7+";
}

/** Weekend nights (Fri/Sat) turn slower than weekdays; the model learns the two
 *  separately. `dow` is 0=Sun…6=Sat; undefined defaults to a weekday. */
export type DowGroup = "wd" | "we";
export function dowGroupOf(dow?: number): DowGroup {
  return dow === 5 || dow === 6 ? "we" : "wd";
}
/** Local weekday (0–6) for a YYYY-MM-DD date, read at noon to dodge DST edges. */
export function dowOf(date: string): number | undefined {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.getDay();
}

/** Base expected dining minutes by party bucket (before the daypart factor). */
const BASE_TURN: Record<TurnBucket, number> = { "1-2": 75, "3-4": 95, "5-6": 120, "7+": 150 };

/** A single realised dining duration — a reservation's `seatedAt → completedAt`. */
export interface TurnSample {
  party: number;
  atMin: number;
  minutes: number;
  /** Local weekday (0–6) the party sat; splits weekday vs weekend learning. */
  dow?: number;
}

/**
 * A learned turn-time model: mean minutes + sample count per
 * (bucket × daypart × weekday-group). Absent cells fall back to the default.
 * Built by `buildTurnModel` from real closes; read via `expectedTurnMin`.
 */
export interface TurnModel {
  cells: Partial<Record<`${TurnBucket}:${Daypart}:${DowGroup}`, { mean: number; n: number }>>;
}

/** Shrinkage strength — how many "prior" samples the default is worth. Higher =
 *  slower to trust thin data. */
const TURN_SHRINKAGE = 4;

/** Aggregate realised durations into a shrinkage-smoothed model. Thin cells
 *  stay close to the default; well-sampled cells move toward the observed mean. */
export function buildTurnModel(samples: TurnSample[]): TurnModel {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const s of samples) {
    if (!Number.isFinite(s.minutes) || s.minutes <= 0 || s.minutes > 600) continue;
    const key = `${turnBucket(s.party)}:${daypartOf(s.atMin)}:${dowGroupOf(s.dow)}`;
    const a = acc.get(key) ?? { sum: 0, n: 0 };
    a.sum += s.minutes;
    a.n += 1;
    acc.set(key, a);
  }
  const cells: TurnModel["cells"] = {};
  for (const [key, a] of acc) {
    const [bucket, daypart] = key.split(":") as [TurnBucket, Daypart, DowGroup];
    // shrink toward the same default this cell would otherwise fall back to
    const prior = Math.round(BASE_TURN[bucket] * DAYPART_FACTOR[daypart]);
    const mean = (a.sum + TURN_SHRINKAGE * prior) / (a.n + TURN_SHRINKAGE);
    cells[key as keyof TurnModel["cells"]] = { mean: Math.round(mean), n: a.n };
  }
  return { cells };
}

/**
 * Expected dining duration (minutes) for a party at a given time. Uses the
 * learned model's cell when present (already shrinkage-smoothed), else the
 * party-bucket default × daypart factor. The engine's single source of
 * turn-time truth — swapping defaults for learning changes no caller.
 */
export function expectedTurnMin(party: number, atMin: number, model?: TurnModel, dow?: number): number {
  const bucket = turnBucket(party);
  const daypart = daypartOf(atMin);
  const learned = model?.cells[`${bucket}:${daypart}:${dowGroupOf(dow)}`];
  if (learned) return learned.mean;
  return Math.round(BASE_TURN[bucket] * DAYPART_FACTOR[daypart]);
}

/** How much data backs a cell's turn-time. `confidence` ∈ (0,1] grows with the
 *  sample count (n/(n+K)); `bandMin` is the ± minutes to show — wider when data
 *  is thin. Cold-start (no learned cell) gives a low-confidence, wide band so a
 *  host knows to use judgement. */
const CONF_K = 8;
export function turnConfidence(party: number, atMin: number, model?: TurnModel, dow?: number): { confidence: number; bandMin: number; n: number } {
  const learned = model?.cells[`${turnBucket(party)}:${daypartOf(atMin)}:${dowGroupOf(dow)}`];
  const n = learned?.n ?? 0;
  const confidence = n > 0 ? n / (n + CONF_K) : 0.35; // priors give a modest floor
  const turn = expectedTurnMin(party, atMin, model, dow);
  const bandMin = Math.max(6, Math.round(turn * (0.2 - 0.12 * confidence)));
  return { confidence, bandMin, n };
}

// ─── Policy ──────────────────────────────────────────────────────────────────

export interface SeatingWeights {
  fit: number;
  runway: number;
  guest: number;
  pacing: number;
  /** Inventory protection — keep big tables for big parties. */
  yield: number;
  /** Section balance — spread covers evenly across server stations (zones). */
  section: number;
}

const WEIGHT_KEYS: (keyof SeatingWeights)[] = ["fit", "runway", "guest", "pacing", "yield", "section"];

export interface SeatingPolicy {
  weights: SeatingWeights;
  /** Bussing / reset minutes added after a turn before the table is "free". */
  resetBufferMin: number;
  /** Max new seatings the room should absorb per 15-minute bucket (pacing). */
  paceCapPer15: number;
  /** A big table (≥ this many seats) is "large" for yield protection. */
  largeTableSeats: number;
  /** Per-zone cap on new seatings per 15-minute bucket — stops one section (and
   *  its server) getting slammed while the rest of the room is calm. 0 = off. */
  sectionCapPer15: number;
  /** Hard-protect large tables: a small party is *excluded* from a large table
   *  whenever a fitting non-large table is available (vs. the soft yield nudge). */
  protectLargeTables: boolean;
  /** Zones held for VIPs — a non-VIP party is excluded from them. Lower-cased on
   *  compare. Empty = no hold. */
  vipHoldZones: string[];
  /** UI: pre-select the engine's top pick instead of only advising. Ignored in
   *  shadow mode (which never auto-applies). */
  autoSuggest: boolean;
  /** Record every seat decision (recommended vs chosen) so the override rate is
   *  measurable and the model can learn what operators actually do. */
  learnFromOverrides: boolean;
  /** Advisory-only: compute + log the recommendation but never auto-apply it, so
   *  a manager can trust the engine before letting it drive. */
  shadowMode: boolean;
}

/** The advanced rules/toggles a preset carries by default — off/neutral so a
 *  fresh preset behaves exactly as before this layer existed (non-regressing). */
const ADVANCED_DEFAULTS = {
  sectionCapPer15: 0,
  protectLargeTables: false,
  vipHoldZones: [] as string[],
  autoSuggest: false,
  learnFromOverrides: true,
  shadowMode: false,
};

function normaliseWeights(w: SeatingWeights): SeatingWeights {
  const total = WEIGHT_KEYS.reduce((s, k) => s + (w[k] || 0), 0) || 1;
  return { fit: w.fit / total, runway: w.runway / total, guest: w.guest / total, pacing: w.pacing / total, yield: w.yield / total, section: w.section / total };
}

/** Balanced — the default. Weights auto-normalise, so these are relative. */
export const BALANCED_POLICY: SeatingPolicy = {
  weights: normaliseWeights({ fit: 0.28, runway: 0.22, guest: 0.2, pacing: 0.1, yield: 0.14, section: 0.06 }),
  resetBufferMin: 10,
  paceCapPer15: 4,
  largeTableSeats: 6,
  ...ADVANCED_DEFAULTS,
};

/** Pack the room — favour tight fit, yield protection and pacing. */
export const MAXIMISE_COVERS_POLICY: SeatingPolicy = {
  ...BALANCED_POLICY,
  weights: normaliseWeights({ fit: 0.34, runway: 0.14, guest: 0.08, pacing: 0.14, yield: 0.26, section: 0.04 }),
  paceCapPer15: 5,
};

/** Guest-experience first — favour preference match and comfortable runway. */
export const GUEST_FIRST_POLICY: SeatingPolicy = {
  ...BALANCED_POLICY,
  weights: normaliseWeights({ fit: 0.22, runway: 0.26, guest: 0.34, pacing: 0.05, yield: 0.09, section: 0.04 }),
  paceCapPer15: 3,
};

/** Slow night — comfort over yield, relax pacing. */
export const SLOW_NIGHT_POLICY: SeatingPolicy = {
  ...BALANCED_POLICY,
  weights: normaliseWeights({ fit: 0.24, runway: 0.3, guest: 0.26, pacing: 0.04, yield: 0.1, section: 0.06 }),
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

/** A location's persisted policy choice: a preset baseline + optional overrides.
 *  Kept here (the pure module) so the client can read the type without pulling
 *  in the server store. */
export interface StoredSeatingPolicy {
  preset: PolicyPreset;
  overrides?: {
    weights?: Partial<SeatingWeights>;
    resetBufferMin?: number;
    paceCapPer15?: number;
    largeTableSeats?: number;
    sectionCapPer15?: number;
    protectLargeTables?: boolean;
    vipHoldZones?: string[];
    autoSuggest?: boolean;
    learnFromOverrides?: boolean;
    shadowMode?: boolean;
  };
}

/** Resolve a stored choice into an effective policy (preset ⊕ overrides). */
export function resolvePolicy(stored: StoredSeatingPolicy): SeatingPolicy {
  const base = POLICY_PRESETS[stored.preset] ?? DEFAULT_POLICY;
  return {
    ...base,
    ...stored.overrides,
    weights: normaliseWeights({ ...base.weights, ...stored.overrides?.weights }),
  };
}

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

/**
 * If a holding reservation is *currently* occupying this table at `atMin` (its
 * [start, start+dur) window covers the instant), the minutes still left on that
 * turn; otherwise `null`. This is what makes "the table is busy right now" a
 * hard constraint — `freeWindowMin` only measures the *forward* window and would
 * otherwise call an occupied table "open all night".
 */
export function occupiedMinLeft(
  tableId: string,
  atMin: number,
  date: string,
  locationSlug: string,
  reservations: Reservation[],
  excludeReservationId?: string,
): number | null {
  let left: number | null = null;
  for (const r of reservations) {
    if (r.id === excludeReservationId) continue;
    if (r.tableId !== tableId || r.locationSlug !== locationSlug || r.date !== date) continue;
    if (!HOLDS.includes(r.status)) continue;
    const start = timeToMinutes(r.time);
    if (!Number.isFinite(start)) continue;
    const end = start + (r.durationMin || 0);
    if (start <= atMin && atMin < end) left = Math.max(left ?? 0, end - atMin);
  }
  return left;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface SuggestionBreakdown {
  fit: number;
  runway: number;
  guest: number;
  pacing: number;
  yield: number;
  section: number;
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
  /** ± minutes on the expected turn (data-driven; wider when learning is thin). */
  turnBandMin: number;
  /** Trust in the turn estimate (0..1) from the learned sample size. */
  confidence: number;
  /** When this seat is predicted to free the table (minutes since midnight). */
  freesAtMin: number;
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
  /** Learned turn-times; when absent the engine uses party-size defaults. */
  turnModel?: TurnModel;
  /** Accessibility features this party requires — a table missing any is excluded. */
  needs?: TableFeature[];
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
  const dow = dowOf(ctx.date);
  const turn = expectedTurnMin(party, ctx.atMin, ctx.turnModel, dow);
  const needFree = turn + policy.resetBufferMin;
  const prefs = ctx.prefs;

  // pacing context — the holds that already start in this atMin 15-min bucket,
  // floor-wide and per-zone (for the section cap).
  const bucket = Math.floor(ctx.atMin / 15);
  const zoneById = new Map(ctx.tables.map((t) => [t.id, t.zone]));
  const bucketHolds = ctx.reservations.filter((r) => {
    if (r.id === ctx.excludeReservationId) return false;
    if (r.locationSlug !== ctx.locationSlug || r.date !== ctx.date) return false;
    if (!HOLDS.includes(r.status)) return false;
    const s = timeToMinutes(r.time);
    return Number.isFinite(s) && Math.floor(s / 15) === bucket;
  });
  const bucketLoad = bucketHolds.length;
  const floorPacing = clamp01(1 - bucketLoad / Math.max(1, policy.paceCapPer15));
  const zoneLoad = (zone?: string): number =>
    zone == null ? 0 : bucketHolds.filter((r) => (r.tableId ? zoneById.get(r.tableId) : undefined) === zone).length;
  const capOn = policy.sectionCapPer15 > 0;
  const vipHold = policy.vipHoldZones.map((z) => z.toLowerCase());
  const inVipHold = (zone?: string): boolean => !!zone && vipHold.includes(zone.toLowerCase());

  // section-balance context — live covers already committed to each zone today,
  // so the engine can steer new covers toward the lighter server station.
  const zoneCovers = new Map<string, number>();
  for (const r of ctx.reservations) {
    if (r.id === ctx.excludeReservationId) continue;
    if (r.locationSlug !== ctx.locationSlug || r.date !== ctx.date) continue;
    if (!HOLDS.includes(r.status)) continue;
    const z = r.tableId ? zoneById.get(r.tableId) : undefined;
    if (z == null) continue;
    zoneCovers.set(z, (zoneCovers.get(z) ?? 0) + (r.partySize || 0));
  }
  const maxZoneCovers = Math.max(0, ...zoneCovers.values());
  const multiZone = new Set(ctx.tables.map((t) => t.zone).filter(Boolean)).size > 1;
  const sectionBalance = (zone?: string): number =>
    zone == null || maxZoneCovers === 0 ? 1 : clamp01(1 - (zoneCovers.get(zone) ?? 0) / maxZoneCovers);

  // Turn-estimate trust + the downstream free-at time — same for every table
  // (they depend on the party & time, not the table).
  const { confidence, bandMin } = turnConfidence(party, ctx.atMin, ctx.turnModel, dow);
  const freesAtMin = ctx.atMin + needFree;

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
      breakdown: { fit: 0, runway: 0, guest: 0, pacing: 0, yield: 0, section: 0 },
      reasons: [],
      freeWindowMin: free,
      expectedTurnMin: turn,
      turnBandMin: bandMin,
      confidence,
      freesAtMin,
      isRecommended: false,
    };

    // ── hard constraints ───────────────────────────────────────────
    if (t.status === "out-of-service") return { ...base, excludedReason: "out of service" };
    if (t.seats < party) return { ...base, excludedReason: "too small" };
    // accessibility — the party needs a feature this table doesn't offer
    if (ctx.needs?.length) {
      const missing = ctx.needs.find((n) => !(t.features ?? []).includes(n));
      if (missing) return { ...base, excludedReason: `no ${missing.replace("-", " ")}` };
    }
    // occupied *right now* by a seated/booked party → hard block (freeWindowMin
    // only sees the forward window, so this must be checked separately)
    const occLeft = occupiedMinLeft(t.id, ctx.atMin, ctx.date, ctx.locationSlug, ctx.reservations, ctx.excludeReservationId);
    if (occLeft != null) return { ...base, excludedReason: `occupied · ${Math.round(occLeft)}m left` };
    if (free < needFree) {
      return { ...base, excludedReason: free === Infinity ? "booked" : `held ${Math.round(free)}m` };
    }
    // VIP hold — this zone is kept for VIPs; a non-VIP party can't take it.
    if (inVipHold(zone) && !prefs?.vip) return { ...base, excludedReason: "VIP hold" };
    // Section cap — the zone has already taken its share of this 15-min window.
    if (capOn && zoneLoad(zone) >= policy.sectionCapPer15) {
      return { ...base, excludedReason: `${zone ?? "section"} full this window` };
    }

    // ── soft sub-scores (0..1) ─────────────────────────────────────
    const over = t.seats - party;
    const fit = clamp01(1 - Math.max(0, over) * 0.18); // exact = 1, decays with oversize
    const runway = free === Infinity ? 1 : clamp01(free / (turn * 1.5 + policy.resetBufferMin));
    // Pacing folds the floor-wide cap with the per-zone section cap (when on) so
    // a filling section drags a table's score down before it hits the hard cap.
    const pacingScore = capOn
      ? Math.min(floorPacing, clamp01(1 - zoneLoad(zone) / Math.max(1, policy.sectionCapPer15)))
      : floorPacing;

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
    let yieldS = isLarge && smallParty ? 0.35 : 1;

    // look-ahead — don't burn a table a *specific* known later party will need.
    // If a booking still to come today fits this table tightly (needs most of its
    // seats) and is bigger than who we're seating now, protect it: seat the small
    // party elsewhere so the night's big demand isn't blocked (fragmentation).
    const laterNeed = smallParty
      ? ctx.reservations.find((L) => {
          if (L.id === ctx.excludeReservationId) return false;
          if (L.locationSlug !== ctx.locationSlug || L.date !== ctx.date) return false;
          if (L.status !== "booked") return false;
          const ls = timeToMinutes(L.time);
          if (!Number.isFinite(ls) || ls <= ctx.atMin) return false;
          return L.partySize > party && L.partySize <= t.seats && L.partySize > t.seats - 2;
        })
      : undefined;
    if (laterNeed) yieldS = Math.min(yieldS, 0.2);

    // section balance — reward the lighter server station (even spread of covers)
    const sectionScore = sectionBalance(zone);

    const w = policy.weights;
    const breakdown: SuggestionBreakdown = {
      fit: w.fit * fit * 100,
      runway: w.runway * runway * 100,
      guest: w.guest * guest * 100,
      pacing: w.pacing * pacingScore * 100,
      yield: w.yield * yieldS * 100,
      section: w.section * sectionScore * 100,
    };
    const score = breakdown.fit + breakdown.runway + breakdown.guest + breakdown.pacing + breakdown.yield + breakdown.section;

    // human reasons (most salient first)
    if (over === 0) reasons.unshift("exact fit");
    else if (over === 1) reasons.unshift("good fit");
    if (free === Infinity) reasons.push("open all night");
    else reasons.push(`free until ${fmtHM(ctx.atMin + free)}`);
    if (laterNeed) reasons.push(`needed for a ${laterNeed.partySize} at ${laterNeed.time}`);
    else if (isLarge && smallParty) reasons.push("large table — held back for big parties");
    if (bucketLoad >= policy.paceCapPer15) reasons.push("busy 15-min window");
    if (capOn && zoneLoad(zone) >= policy.sectionCapPer15 - 1 && zone) reasons.push(`${zone} filling up`);
    else if (multiZone && zone && sectionScore >= 0.8) reasons.push(`${zone} station light`);

    return { ...base, ok: true, score: Math.round(score), breakdown, reasons };
  });

  // Protect large tables (hard) — once every table is scored, drop a small party
  // from any large `ok` table *provided* a fitting non-large table is still open,
  // so the big top stays for big demand. Never strands the party: if only large
  // tables fit, they remain seatable.
  if (policy.protectLargeTables) {
    const hasNonLargeOk = out.some((s) => s.ok && s.seats < policy.largeTableSeats);
    if (hasNonLargeOk) {
      for (const s of out) {
        if (s.ok && s.seats >= policy.largeTableSeats && party <= s.seats - 2) {
          s.ok = false;
          s.score = 0;
          s.isRecommended = false;
          s.excludedReason = "large table — protected for big parties";
        }
      }
    }
  }

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

// ─── Table joins — combine tables for a party no single table fits ────────────

export interface JoinSuggestion {
  /** The tables to combine, largest-first (the first is the primary). */
  tableIds: string[];
  numbers: string[];
  /** Total seats across the combined tables. */
  seats: number;
  /** Shared zone (joins only combine within one zone — an adjacency proxy). */
  zone?: string;
  /** Minutes all the tables are free from now (the min across them). */
  freeWindowMin: number;
  reason: string;
}

/**
 * When no single table seats the party, propose the smallest set of free tables
 * in one zone whose seats sum to the party (a "join"). Physical availability
 * only — each table must be free for the full turn, not occupied now, not
 * out-of-service, and satisfy any accessibility needs. Greedy largest-first,
 * so the combine uses as few tables as possible; ranked by fewest tables then
 * least wasted seats. Pure & deterministic. Returns [] when a single table
 * already fits or no combination reaches the party.
 */
export function suggestJoins(ctx: SuggestContext): JoinSuggestion[] {
  const policy = ctx.policy ?? DEFAULT_POLICY;
  const party = Math.max(1, Math.floor(ctx.party || 1));
  const turn = expectedTurnMin(party, ctx.atMin, ctx.turnModel);
  const needFree = turn + policy.resetBufferMin;

  // A single table already fits → no need to combine.
  const availables = ctx.tables.filter((t) => {
    if (t.status === "out-of-service") return false;
    if (ctx.needs?.length && ctx.needs.some((n) => !(t.features ?? []).includes(n))) return false;
    if (occupiedMinLeft(t.id, ctx.atMin, ctx.date, ctx.locationSlug, ctx.reservations, ctx.excludeReservationId) != null) return false;
    const free = freeWindowMin(t.id, ctx.atMin, ctx.date, ctx.locationSlug, ctx.reservations, ctx.excludeReservationId);
    return free >= needFree;
  });
  if (availables.some((t) => t.seats >= party)) return [];

  // group by zone (undefined → its own "—" bucket) and greedily combine.
  const byZone = new Map<string, FloorTable[]>();
  for (const t of availables) {
    const z = t.zone ?? "—";
    (byZone.get(z) ?? byZone.set(z, []).get(z)!).push(t);
  }
  const out: JoinSuggestion[] = [];
  for (const [z, group] of byZone) {
    const sorted = [...group].sort((a, b) => b.seats - a.seats);
    const picked: FloorTable[] = [];
    let seats = 0;
    for (const t of sorted) {
      if (seats >= party) break;
      if (picked.length >= 4) break; // combining >4 tables isn't realistic
      picked.push(t);
      seats += t.seats;
    }
    if (seats >= party && picked.length >= 2) {
      const free = Math.min(...picked.map((t) => freeWindowMin(t.id, ctx.atMin, ctx.date, ctx.locationSlug, ctx.reservations, ctx.excludeReservationId)));
      out.push({
        tableIds: picked.map((t) => t.id),
        numbers: picked.map((t) => t.number),
        seats,
        zone: z === "—" ? undefined : z,
        freeWindowMin: free,
        reason: `combine ${picked.length} tables${z === "—" ? "" : ` in ${z}`} · seats ${seats}`,
      });
    }
  }
  // fewest tables first, then least wasted seats
  return out.sort((a, b) => a.tableIds.length - b.tableIds.length || a.seats - party - (b.seats - party)).slice(0, 3);
}

// ─── Waitlist quote — how long until a fitting table frees ────────────────────

/**
 * Estimate the wait (minutes) for a party joining the queue now: the soonest a
 * table that fits them frees, pushed out by the parties already waiting ahead
 * that compete for the same tables. Free-now tables quote 0; occupied ones quote
 * their remaining turn + a reset buffer. `null` when no table could ever seat the
 * party (too big / lacks a needed feature). Pure & deterministic.
 */
export function estimateWaitMin(input: {
  party: number;
  atMin: number;
  date: string;
  locationSlug: string;
  tables: FloorTable[];
  reservations: Reservation[];
  aheadCount: number;
  needs?: TableFeature[];
  resetBufferMin?: number;
  turnModel?: TurnModel;
}): number | null {
  const reset = input.resetBufferMin ?? DEFAULT_POLICY.resetBufferMin;
  const fitting = input.tables.filter(
    (t) => t.status !== "out-of-service" && t.seats >= input.party && (input.needs?.every((n) => (t.features ?? []).includes(n)) ?? true),
  );
  if (!fitting.length) return null;
  // when each fitting table next becomes available (0 = free now)
  const avail = fitting
    .map((t) => {
      const occ = occupiedMinLeft(t.id, input.atMin, input.date, input.locationSlug, input.reservations);
      return occ == null ? 0 : Math.round(occ + reset);
    })
    .sort((a, b) => a - b);
  const ahead = Math.max(0, Math.floor(input.aheadCount));
  if (ahead < avail.length) return avail[ahead];
  // more waiting parties than fitting tables → extra full turns beyond the last
  const turn = expectedTurnMin(input.party, input.atMin, input.turnModel) + reset;
  const extraRounds = Math.floor((ahead - avail.length) / Math.max(1, avail.length)) + 1;
  return avail[avail.length - 1] + extraRounds * turn;
}

// ─── Pre-service simulation — forecast the night before it starts ─────────────

export interface SimAtRisk {
  id: string;
  customerName: string;
  time: string;
  partySize: number;
  /** Why this booking is at risk: "no table" · "table too small" · "double-booked". */
  reason: string;
}

export interface SimBucket {
  atMin: number;
  label: string;
  occupiedTables: number;
  occupancyPct: number;
}

export interface ServiceSimulation {
  bookings: number;
  covers: number;
  serviceableTables: number;
  peakOccupancyPct: number;
  peakAtMin: number | null;
  buckets: SimBucket[];
  atRisk: SimAtRisk[];
}

const SIM_WINDOW_START = 17 * 60;
const SIM_WINDOW_END = 23 * 60;
const SIM_BUCKET_MIN = 30;

/**
 * Run the whole reservation book against the floor before service to forecast
 * pressure and flag un-seatable bookings early (concept 6, `simulate()`). Pure:
 * counts covers, computes per-30-min table occupancy + the peak, and surfaces
 * every at-risk booking (no table, a table too small for the party even with its
 * joined tables, or a double-booked slot). Deterministic → unit-testable.
 */
export function simulateService(input: {
  tables: FloorTable[];
  reservations: Reservation[];
  date: string;
  locationSlug: string;
  windowStartMin?: number;
  windowEndMin?: number;
}): ServiceSimulation {
  const startMin = input.windowStartMin ?? SIM_WINDOW_START;
  const endMin = input.windowEndMin ?? SIM_WINDOW_END;
  const serviceable = input.tables.filter((t) => t.status !== "out-of-service");
  const tableById = new Map(input.tables.map((t) => [t.id, t]));
  // The "book": live bookings (booked or already seated) for this day.
  const book = input.reservations.filter(
    (r) => r.locationSlug === input.locationSlug && r.date === input.date && (r.status === "booked" || r.status === "seated"),
  );

  const atRisk: SimAtRisk[] = [];
  for (const r of book) {
    const primary = r.tableId ? tableById.get(r.tableId) : undefined;
    let reason: string | null = null;
    if (!primary) {
      reason = "no table";
    } else {
      const joinSeats = (r.joinedTableIds ?? []).reduce((s, id) => s + (tableById.get(id)?.seats ?? 0), 0);
      if (primary.seats + joinSeats < r.partySize) reason = "table too small";
      else if (findReservationConflicts(book, r).length > 0) reason = "double-booked";
    }
    if (reason) atRisk.push({ id: r.id, customerName: r.customerName, time: r.time, partySize: r.partySize, reason });
  }

  // Per-bucket occupancy: distinct tables (primary + joined) held by a booking
  // whose [time, time+dur) window covers the bucket start.
  const buckets: SimBucket[] = [];
  let peakOccupancyPct = 0;
  let peakAtMin: number | null = null;
  for (let m = startMin; m <= endMin; m += SIM_BUCKET_MIN) {
    const held = new Set<string>();
    for (const r of book) {
      const s = timeToMinutes(r.time);
      if (!Number.isFinite(s)) continue;
      const e = s + (r.durationMin || 90);
      if (s <= m && m < e) {
        for (const id of [r.tableId, ...(r.joinedTableIds ?? [])]) if (id && tableById.has(id)) held.add(id);
      }
    }
    const occupancyPct = serviceable.length ? Math.round((held.size / serviceable.length) * 100) : 0;
    if (occupancyPct > peakOccupancyPct) { peakOccupancyPct = occupancyPct; peakAtMin = m; }
    buckets.push({ atMin: m, label: fmtHM(m), occupiedTables: held.size, occupancyPct });
  }

  return {
    bookings: book.length,
    covers: book.reduce((s, r) => s + (r.partySize || 0), 0),
    serviceableTables: serviceable.length,
    peakOccupancyPct,
    peakAtMin,
    buckets,
    atRisk: atRisk.sort((a, b) => a.time.localeCompare(b.time)),
  };
}

// ─── Trust loop — learn-from-overrides / shadow-mode telemetry ────────────────

/** One logged seat decision: what the engine recommended vs. what the operator
 *  chose. The raw material for the override rate and, later, learning. */
/** The reasons an operator can give when overriding the engine's pick. */
export type OverrideReason = "guest-request" | "server-balance" | "large-party" | "vip" | "other";
export const OVERRIDE_REASONS: OverrideReason[] = ["guest-request", "server-balance", "large-party", "vip", "other"];

export interface SeatingDecision {
  id: string;
  locationSlug: string;
  at: string; // ISO timestamp
  party: number;
  atMin: number;
  recommendedTableId: string | null;
  chosenTableId: string;
  /** chosen ≠ recommended — the operator overrode the engine. */
  override: boolean;
  /** The engine was advisory-only (shadow mode) when this was logged. */
  shadow: boolean;
  /** Why the operator overrode (only meaningful when `override`). */
  reason?: OverrideReason;
  /** The signal that contributed most to the recommended pick's score — so the
   *  tuning loop can spot a signal operators keep overriding. */
  topSignal?: keyof SeatingWeights;
}

/** Rolled-up trust signal over a location's recent decisions. */
export interface SeatingDecisionSummary {
  n: number;
  overrides: number;
  /** Share of decisions where the operator agreed with the engine (0..1). */
  agreeRate: number;
  shadow: number;
  lastAt: string | null;
  /** The most common override reason (null when no reasons captured). */
  topReason: { reason: OverrideReason; count: number } | null;
  /** A weight-tuning nudge: the signal most associated with overrides + the
   *  share of overrides where it was the recommended pick's top signal. Null
   *  until there's enough signal to suggest a change. */
  nudge: { signal: keyof SeatingWeights; share: number; overrides: number } | null;
}

/** Summarise decisions into the trust readout. Pure so the UI and any report
 *  share one definition of "agreement" and the tuning nudge. */
export function summariseDecisions(decisions: SeatingDecision[]): SeatingDecisionSummary {
  const n = decisions.length;
  const overridden = decisions.filter((d) => d.override);
  const overrides = overridden.length;
  const shadow = decisions.filter((d) => d.shadow).length;
  const lastAt = decisions.reduce<string | null>((a, d) => (a && a > d.at ? a : d.at), null);

  // most common override reason
  const reasonCounts = new Map<OverrideReason, number>();
  for (const d of overridden) if (d.reason) reasonCounts.set(d.reason, (reasonCounts.get(d.reason) ?? 0) + 1);
  let topReason: SeatingDecisionSummary["topReason"] = null;
  for (const [reason, count] of reasonCounts) if (!topReason || count > topReason.count) topReason = { reason, count };

  // tuning nudge — which signal dominates the overridden recommendations?
  const signalCounts = new Map<keyof SeatingWeights, number>();
  for (const d of overridden) if (d.topSignal) signalCounts.set(d.topSignal, (signalCounts.get(d.topSignal) ?? 0) + 1);
  let nudge: SeatingDecisionSummary["nudge"] = null;
  for (const [signal, count] of signalCounts) {
    const share = overrides ? count / overrides : 0;
    // only nudge once a signal is behind a clear majority of overrides (≥3, ≥40%)
    if (count >= 3 && share >= 0.4 && (!nudge || count > nudge.overrides)) nudge = { signal, share, overrides: count };
  }

  return { n, overrides, agreeRate: n ? (n - overrides) / n : 0, shadow, lastAt, topReason, nudge };
}
