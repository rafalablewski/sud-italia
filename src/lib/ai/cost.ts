/**
 * LLM cost attribution (m4_5). Token counts × per-model pricing →
 * grosze. We charge in PLN grosze (integer) to match every other
 * money rail in the system; the conversion uses a fixed USD→PLN rate
 * to keep the math deterministic across the request lifetime. The
 * rate is loose by design — this is for budget enforcement, not
 * accounting, and Phase 5 can swap in a real FX feed.
 *
 * Pricing source: Anthropic public pricing (cached, see skill docs).
 * Cache-read tokens are 10% of input tokens; cache-creation is 125%.
 */

const USD_TO_PLN = 4.0; // sufficient for budget alerts; not a ledger entry

interface ModelPricing {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache-read tokens */
  cacheRead: number;
  /** USD per 1M cache-creation tokens */
  cacheCreate: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheCreate: 6.25 },
  "claude-opus-4-7": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheCreate: 6.25 },
  "claude-opus-4-6": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheCreate: 6.25 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheRead: 0.1, cacheCreate: 1.25 },
  // Google Gemini public pricing (≤200k context tier). No prompt cache rail,
  // so cache columns mirror input — they're unused on the Gemini path.
  "gemini-2.5-pro": { input: 1.25, output: 10.0, cacheRead: 1.25, cacheCreate: 1.25 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.3, cacheCreate: 0.3 },
};

const FALLBACK: ModelPricing = PRICING["claude-opus-4-7"];

export interface UsageBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export function estimateCallCostGrosze(model: string, usage: UsageBreakdown): number {
  const p = PRICING[model] ?? FALLBACK;
  const usd =
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheCreationTokens * p.cacheCreate) /
    1_000_000;
  return Math.ceil(usd * USD_TO_PLN * 100);
}

/** Default daily ceiling — overridden by AI_DAILY_BUDGET_GROSZE env. */
const DEFAULT_DAILY_BUDGET_GROSZE = 100_000; // 1000 PLN

export function getDailyBudgetGrosze(): number {
  const env = process.env.AI_DAILY_BUDGET_GROSZE;
  if (!env) return DEFAULT_DAILY_BUDGET_GROSZE;
  const n = Number.parseInt(env, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_BUDGET_GROSZE;
}
