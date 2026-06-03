"use client";

import { create } from "zustand";
import { fetchPublicSettings, type PublicSurvey } from "@/lib/public-settings";

/**
 * Pulse micro-survey trigger engine (client side).
 *
 * Surfaces at most one tasteful, dismissible star prompt per browsing
 * session, matched to a fired signal (after ordering, prolonged browsing,
 * exit intent, …). The hard job here is *restraint*: a survey that nags is
 * worse than no survey, so eligibility is gated three ways —
 *
 *   1. **Session-once** — one prompt per page-session, full stop
 *      (in-memory; resets on reload). This is the primary nag guard.
 *   2. **Global gap** — never within `GLOBAL_MIN_GAP_HOURS` of the last
 *      prompt this browser saw, across sessions (localStorage).
 *   3. **Per-survey cooldown** — once a guest has seen *or* answered a
 *      given survey, don't re-ask it for that survey's `cooldownDays`.
 *
 * The component (`SurveyPrompt`) renders + POSTs; this store only owns
 * trigger eligibility + visibility, so it stays free of React/identity
 * concerns and can be driven from plain effects.
 */

export interface SurveyContext {
  locationSlug?: string;
  pagePath?: string;
}

interface ActivePrompt {
  survey: PublicSurvey;
  context: SurveyContext;
}

const LOG_KEY = "sud-survey-log";
/** Don't show two prompts to the same browser closer than this, ever. */
const GLOBAL_MIN_GAP_HOURS = 8;

interface SurveyLog {
  /** surveyId → ISO date last answered. */
  answered: Record<string, string>;
  /** surveyId → ISO date last shown (answered OR dismissed). */
  seen: Record<string, string>;
  /** ISO date the browser was last shown any prompt. */
  lastPromptAt?: string;
}

function readLog(): SurveyLog {
  if (typeof window === "undefined") return { answered: {}, seen: {} };
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return { answered: {}, seen: {} };
    const parsed = JSON.parse(raw) as Partial<SurveyLog>;
    return {
      answered: parsed.answered ?? {},
      seen: parsed.seen ?? {},
      lastPromptAt: parsed.lastPromptAt,
    };
  } catch {
    return { answered: {}, seen: {} };
  }
}

function writeLog(log: SurveyLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // Private mode / quota — fail open (we just lose frequency memory).
  }
}

function hoursSince(iso: string | undefined): number {
  if (!iso) return Infinity;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / 36e5;
}

function daysSince(iso: string | undefined): number {
  return hoursSince(iso) / 24;
}

interface SurveyStore {
  active: ActivePrompt | null;
  /** Flips true the moment any prompt shows; gates the rest of the session. */
  promptedThisSession: boolean;
  /**
   * Ask the engine to surface a survey for `trigger`. No-ops (silently)
   * unless every eligibility gate passes. Returns whether a prompt opened.
   */
  request: (trigger: PublicSurvey["trigger"], context?: SurveyContext) => Promise<boolean>;
  /** Dismiss without answering — still counts as "seen" for cooldown. */
  /** Record that the elected prompt actually painted — burns the global gap
   *  + per-survey "seen" budgets. Called by SurveyPrompt on mount so a guest
   *  who is never shown anything (fast navigation) isn't locked out. */
  markShown: (surveyId: string) => void;
  dismiss: () => void;
  /** Record a submitted answer + close. */
  markAnswered: (surveyId: string) => void;
}

/** Is this survey within its per-person cooldown (seen OR answered)? */
function inCooldown(log: SurveyLog, survey: PublicSurvey): boolean {
  const cd = survey.cooldownDays;
  return daysSince(log.seen[survey.id]) < cd || daysSince(log.answered[survey.id]) < cd;
}

export const useSurveyStore = create<SurveyStore>((set, get) => ({
  active: null,
  promptedThisSession: false,

  request: async (trigger, context = {}) => {
    if (get().active || get().promptedThisSession) return false;

    const settings = await fetchPublicSettings(context.locationSlug);
    // Re-check after the await: a second trigger (or a StrictMode double
    // invoke) could have elected a prompt while this one was in flight.
    if (get().active || get().promptedThisSession) return false;

    // Umbrella kill-switch (Settings → Layout) — fail safe to OFF only when
    // explicitly false; absent settings keep the historical behaviour.
    if (settings?.layout?.showNpsSurvey === false) return false;

    const log = readLog();
    // Global gap across sessions — measured from the last prompt actually
    // shown (markShown), not merely elected.
    if (hoursSince(log.lastPromptAt) < GLOBAL_MIN_GAP_HOURS) return false;

    // Pick the FIRST active survey for this trigger that isn't in cooldown —
    // operators can activate several per trigger to rotate questions, and a
    // cooled-down leader shouldn't suppress the others.
    const candidates = (settings?.surveys ?? []).filter((s) => s.trigger === trigger);
    const survey = candidates.find((s) => !inCooldown(log, s));
    if (!survey) return false;

    // Reserve the in-memory session slot now (prevents a concurrent trigger
    // from also opening), but DON'T burn the persistent seen/gap budgets until
    // the card paints — see markShown.
    set({ active: { survey, context }, promptedThisSession: true });
    return true;
  },

  markShown: (surveyId) => {
    const log = readLog();
    const now = new Date().toISOString();
    log.seen[surveyId] = now;
    log.lastPromptAt = now;
    writeLog(log);
  },

  dismiss: () => set({ active: null }),

  markAnswered: (surveyId) => {
    const log = readLog();
    log.answered[surveyId] = new Date().toISOString();
    writeLog(log);
    set({ active: null });
  },
}));
