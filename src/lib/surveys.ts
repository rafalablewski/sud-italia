// Pulse surveys — NPS-style micro-surveys captured opportunistically
// across the storefront.
//
// This module is intentionally PURE (no `fs`, no `@neondatabase/serverless`,
// no `next/headers`) so it is safe to import from BOTH server code
// (`src/lib/store.ts`, API routes) and `"use client"` components (the
// trigger engine, the admin board) — CLAUDE rule 3. Persistence lives in
// `src/lib/store.ts`; the seed catalogue, the shared types, and the
// scoring maths live here.
//
// Why stars (1–5) and not the classic 0–10 NPS scale: the brief is a
// "quick, easy" tap that fits a single line on a phone. We keep the NPS
// *semantics* (promoter / passive / detractor → a −100…+100 score) but
// map them onto the 5-star control the storefront already uses
// (`StarRating`), so a guest answers in one tap and the operator still
// gets a real, benchmarkable Pulse score.

/**
 * Where a survey can fire. Each value is wired to a concrete signal in
 * `SurveyTriggerEngine` / the order-confirmation page — a survey whose
 * trigger isn't in this union can never surface (CLAUDE rule 1: no
 * cosmetic features).
 */
export const SURVEY_TRIGGERS = [
  // After a successful checkout — "how was the process?"
  "post-order",
  // The guest has been on a location/menu page a while without ordering —
  // "finding everything okay?"
  "prolonged-browse",
  // Pointer left the viewport on a buying page (desktop) — "leaving so soon?"
  "exit-intent",
  // Dwelled on the /rewards page — "is the programme clear?"
  "rewards-page",
  // A returning visitor (2nd+ session) landed on the storefront — classic
  // "how likely are you to recommend us?"
  "repeat-visit",
] as const;

export type SurveyTrigger = (typeof SURVEY_TRIGGERS)[number];

export const SURVEY_TRIGGER_LABEL: Record<SurveyTrigger, string> = {
  "post-order": "After ordering",
  "prolonged-browse": "Prolonged browsing",
  "exit-intent": "Exit intent",
  "rewards-page": "Rewards page",
  "repeat-visit": "Returning visitor",
};

/**
 * A single configurable micro-survey. Operators flip `active`, edit copy,
 * and tune the per-person `cooldownDays` from /admin/surveys; the catalogue
 * below seeds sensible defaults.
 */
export interface SurveyDefinition {
  id: string;
  trigger: SurveyTrigger;
  /** Operator master switch for this one survey (CLAUDE rule 7 — toggle = saved). */
  active: boolean;
  /** The headline question shown above the stars. */
  question: string;
  /** Optional one-line subtext under the question. */
  subtext?: string;
  /** What 1 star means (anchors the low end of the scale). */
  scaleLow: string;
  /** What 5 stars mean (anchors the high end of the scale). */
  scaleHigh: string;
  /** Prompt for the optional free-text follow-up after a rating. */
  commentPrompt: string;
  /** Don't re-ask the same browser this survey within N days. */
  cooldownDays: number;
}

/** A captured answer. Persisted via `src/lib/store.ts`. */
export interface SurveyResponse {
  id: string;
  surveyId: string;
  trigger: SurveyTrigger;
  /** 1–5 stars. */
  rating: number;
  comment?: string;
  /** Passive identity if we know it (cookie) — never a sign-up wall. */
  customerPhone?: string;
  customerName?: string;
  locationSlug?: string;
  /** The path the guest was on when they answered. */
  pagePath?: string;
  /** ISO timestamp. */
  date: string;
}

/**
 * The seed catalogue. The first survey for each wired trigger ships
 * `active`; the rest are ready-made "ideas" the operator can switch on (or
 * swap in for the active one) without a code change. Voice matches the V8
 * Trattoria storefront — warm, bilingual, one tap.
 */
export const DEFAULT_SURVEYS: SurveyDefinition[] = [
  // ── After ordering ──────────────────────────────────────────────
  {
    id: "post-order-ease",
    trigger: "post-order",
    active: true,
    question: "How easy was placing your order?",
    subtext: "Com'è andata? One tap helps us keep it effortless.",
    scaleLow: "A struggle",
    scaleHigh: "Effortless",
    commentPrompt: "Anything that slowed you down?",
    cooldownDays: 14,
  },
  {
    id: "post-order-value",
    trigger: "post-order",
    active: false,
    question: "Did your order feel like good value?",
    subtext: "Onesto — was it worth it?",
    scaleLow: "Overpriced",
    scaleHigh: "Great value",
    commentPrompt: "What would make it feel like better value?",
    cooldownDays: 21,
  },
  {
    id: "post-order-recommend",
    trigger: "post-order",
    active: false,
    question: "How likely are you to recommend us to a friend?",
    subtext: "The classic question — your honest take.",
    scaleLow: "Not likely",
    scaleHigh: "Absolutely",
    commentPrompt: "What's the one thing that would make it a 5?",
    cooldownDays: 30,
  },
  // ── Prolonged browsing ──────────────────────────────────────────
  {
    id: "browse-findability",
    trigger: "prolonged-browse",
    active: true,
    question: "Finding everything okay?",
    subtext: "Tutto bene? Tell us how easy the menu is to navigate.",
    scaleLow: "I'm lost",
    scaleHigh: "Crystal clear",
    commentPrompt: "What were you looking for?",
    cooldownDays: 7,
  },
  {
    id: "browse-variety",
    trigger: "prolonged-browse",
    active: false,
    question: "Happy with the menu variety?",
    subtext: "Is there enough to choose from?",
    scaleLow: "Too little",
    scaleHigh: "Plenty",
    commentPrompt: "What dish are you hoping to see?",
    cooldownDays: 21,
  },
  {
    id: "browse-dietary",
    trigger: "prolonged-browse",
    active: false,
    question: "Could you find the allergen & dietary info you needed?",
    subtext: "Vegan, gluten, allergens — was it clear?",
    scaleLow: "Couldn't find it",
    scaleHigh: "All there",
    commentPrompt: "Which detail was missing?",
    cooldownDays: 21,
  },
  // ── Exit intent ─────────────────────────────────────────────────
  {
    id: "exit-visit",
    trigger: "exit-intent",
    active: true,
    question: "Leaving already — how was your visit?",
    subtext: "A presto! One tap before you go.",
    scaleLow: "Disappointing",
    scaleHigh: "Lovely",
    commentPrompt: "What sent you on your way?",
    cooldownDays: 14,
  },
  {
    id: "exit-checkout-friction",
    trigger: "exit-intent",
    active: false,
    question: "Did anything get in the way of checking out?",
    subtext: "Be honest — we want to fix it.",
    scaleLow: "Total blocker",
    scaleHigh: "Smooth sailing",
    commentPrompt: "Where did it snag?",
    cooldownDays: 14,
  },
  // ── Rewards page ────────────────────────────────────────────────
  {
    id: "rewards-clarity",
    trigger: "rewards-page",
    active: false,
    question: "Is our rewards programme easy to understand?",
    subtext: "Punti, tiers, perks — does it make sense?",
    scaleLow: "Confusing",
    scaleHigh: "Totally clear",
    commentPrompt: "What part is unclear?",
    cooldownDays: 30,
  },
  // ── Returning visitor ───────────────────────────────────────────
  {
    id: "repeat-recommend",
    trigger: "repeat-visit",
    active: false,
    question: "Welcome back! How likely are you to recommend Sud Italia?",
    subtext: "Bentornato — your loyalty means everything.",
    scaleLow: "Not likely",
    scaleHigh: "Already do",
    commentPrompt: "What keeps you coming back — or what nearly didn't?",
    cooldownDays: 45,
  },
  {
    id: "repeat-favourite",
    trigger: "repeat-visit",
    active: false,
    question: "How are we doing lately?",
    subtext: "Across your recent visits — the overall feel.",
    scaleLow: "Slipping",
    scaleHigh: "Better than ever",
    commentPrompt: "What changed for you, good or bad?",
    cooldownDays: 45,
  },
  {
    id: "browse-support",
    trigger: "prolonged-browse",
    active: false,
    question: "Need a hand finding something?",
    subtext: "Posso aiutarti? Rate how well we're guiding you.",
    scaleLow: "Could use help",
    scaleHigh: "All sorted",
    commentPrompt: "What can we help you find?",
    cooldownDays: 7,
  },
];

/** Promoter (5) / passive (4) / detractor (1–3) — NPS semantics on 5 stars. */
export function classifyRating(
  rating: number,
): "promoter" | "passive" | "detractor" {
  if (rating >= 5) return "promoter";
  if (rating === 4) return "passive";
  return "detractor";
}

export interface PulseBreakdown {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** NPS-style net score on a −100…+100 scale. */
  pulse: number;
}

/**
 * Single-pass NPS breakdown — promoter/passive/detractor counts plus the net
 * Pulse score. The one place the promoter/detractor definition lives, so the
 * admin board and the score never drift.
 */
export function pulseBreakdown(responses: { rating: number }[]): PulseBreakdown {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of responses) {
    const c = classifyRating(r.rating);
    if (c === "promoter") promoters++;
    else if (c === "passive") passives++;
    else detractors++;
  }
  const total = responses.length;
  const pulse = total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100);
  return { total, promoters, passives, detractors, pulse };
}

/**
 * The Pulse score — an NPS-style net of promoters minus detractors as a
 * percentage of all answers, on a −100…+100 scale. Identical maths to a
 * classic NPS, just sourced from the 5-star control.
 */
export function computePulseScore(responses: { rating: number }[]): number {
  return pulseBreakdown(responses).pulse;
}

/** Simple mean of the star ratings (0 when empty). */
export function averageStars(responses: { rating: number }[]): number {
  if (responses.length === 0) return 0;
  return responses.reduce((sum, r) => sum + r.rating, 0) / responses.length;
}

/**
 * Merge a persisted survey list with the seed catalogue: saved rows win
 * (operator edits are sticky), and any newly-shipped default survey that
 * isn't persisted yet is appended so a deploy never drops a new idea.
 */
export function mergeSurveysWithDefaults(
  saved: SurveyDefinition[] | null | undefined,
): SurveyDefinition[] {
  if (!saved || saved.length === 0) return DEFAULT_SURVEYS.map((s) => ({ ...s }));
  const byId = new Map(saved.map((s) => [s.id, s]));
  const merged: SurveyDefinition[] = saved.map((s) => ({ ...s }));
  for (const def of DEFAULT_SURVEYS) {
    if (!byId.has(def.id)) merged.push({ ...def });
  }
  return merged;
}
