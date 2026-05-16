import { callGateway, extractText, gatewayConfigured } from "@/lib/ai/gateway";
import { getCacheJson, setCacheJson } from "@/lib/store";
import { logger } from "@/lib/logger";

/**
 * Claude-backed demand forecast (audit §3 — replaces the 7-day moving
 * average that was being sold as "AI"). Given a daily series of orders
 * + revenue + weather hints, asks Claude for a structured 7-day-ahead
 * forecast with reasoning. Caches the result for 24h per
 * (location, series-fingerprint) so the operator doesn't pay token
 * costs on every dashboard load.
 *
 * Falls back to the rolling-average forecast when ANTHROPIC_API_KEY
 * is unset. The result shape is identical so the UI doesn't fork.
 */

export interface ForecastDailyInput {
  date: string;
  orderCount: number;
  revenue: number;
}

export interface ForecastDailyOutput {
  date: string;
  predictedOrders: number;
  lower: number;
  upper: number;
}

export interface ForecastResult {
  /** "claude" when produced by the Anthropic gateway, "ma" when produced
   *  by the heuristic fallback. The dashboard surfaces the source so
   *  operators don't mistake heuristics for ML. */
  source: "claude" | "ma";
  generatedAt: string;
  days: ForecastDailyOutput[];
  /** Short prose paragraph from the model — operator-actionable
   *  reasoning. Empty for the MA fallback. */
  reasoning: string;
  /** Cache hit / miss for observability — the UI doesn't show this. */
  cacheHit: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function fingerprint(input: ForecastDailyInput[]): string {
  if (input.length === 0) return "empty";
  const last = input[input.length - 1];
  // Just (count, last-date, last-order-count) — enough to invalidate
  // when fresh data lands, cheap to compute.
  return `${input.length}:${last.date}:${last.orderCount}`;
}

function rollingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((acc, v) => acc + v, 0) / slice.length);
  }
  return out;
}

function fallbackForecast(input: ForecastDailyInput[]): ForecastDailyOutput[] {
  if (input.length === 0) return [];
  const values = input.map((d) => d.orderCount);
  const ma = rollingAverage(values, 7);
  const last = ma[ma.length - 1] ?? 0;
  const lastDate = input[input.length - 1]?.date;
  if (!lastDate) return [];
  const out: ForecastDailyOutput[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(lastDate);
    d.setUTCDate(d.getUTCDate() + i);
    out.push({
      date: d.toISOString().slice(0, 10),
      predictedOrders: Math.round(last),
      lower: Math.max(0, Math.round(last * 0.8)),
      upper: Math.round(last * 1.2),
    });
  }
  return out;
}

interface ClaudeForecastShape {
  days?: { date?: string; predicted_orders?: number; lower?: number; upper?: number }[];
  reasoning?: string;
}

function parseClaudeJson(text: string): ClaudeForecastShape | null {
  const trimmed = text.trim();
  // Model usually returns a fenced ```json block or bare JSON; try both.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(candidate) as ClaudeForecastShape;
  } catch {
    return null;
  }
}

export async function generateDemandForecast(
  locationSlug: string,
  series: ForecastDailyInput[],
): Promise<ForecastResult> {
  const cacheKey = `ai-forecast-${locationSlug}.json`;
  const fp = fingerprint(series);
  const cached = await getCacheJson<{
    fp: string;
    expiresAt: number;
    result: Omit<ForecastResult, "cacheHit">;
  } | null>(cacheKey, null);
  if (cached && cached.fp === fp && cached.expiresAt > Date.now()) {
    return { ...cached.result, cacheHit: true };
  }

  // No API key → degrade gracefully to the heuristic.
  if (!gatewayConfigured()) {
    const result: ForecastResult = {
      source: "ma",
      generatedAt: new Date().toISOString(),
      days: fallbackForecast(series),
      reasoning: "",
      cacheHit: false,
    };
    await setCacheJson(cacheKey, {
      fp,
      expiresAt: Date.now() + CACHE_TTL_MS,
      result,
    });
    return result;
  }

  // Bound the series we send so a long-running location doesn't blow
  // the prompt up. 90 days is plenty for weekly + seasonal signal.
  const trimmed = series.slice(-90);
  const lastDate = trimmed[trimmed.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  const system =
    "You are a demand forecaster for a Polish Neapolitan pizza truck chain. " +
    "Given a daily series of order counts and revenue, output a STRICT JSON object — " +
    "no prose outside JSON, no markdown — with this shape:\n" +
    "{ \"days\": [{ \"date\": \"YYYY-MM-DD\", \"predicted_orders\": int, " +
    "\"lower\": int, \"upper\": int }, ...], \"reasoning\": \"one paragraph\" }\n" +
    "Predict 7 days starting the day AFTER the last input date. " +
    "Account for weekly seasonality (Friday/Saturday peaks, Sunday/Monday troughs), " +
    "month-over-month trend, and any visible holidays in the input window. " +
    "Lower/upper are an 80% confidence band, integers, non-negative. " +
    "Reasoning is 1–2 short sentences an operator can act on (staffing, dough prep).";

  const userText = JSON.stringify({
    locationSlug,
    lastDate,
    seriesDays: trimmed.length,
    series: trimmed.map((d) => ({
      date: d.date,
      orders: d.orderCount,
      revenue_grosze: d.revenue,
    })),
  });

  try {
    const { message } = await callGateway({
      feature: "demand-forecast",
      system,
      maxTokens: 1500,
      effort: "medium",
      thinking: "off",
      messages: [
        {
          role: "user",
          content: userText,
        },
      ],
    });
    const text = extractText(message);
    const parsed = parseClaudeJson(text);
    if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) {
      logger.warn("ai.forecast.unparseable", {
        layer: "ai.forecast",
        locationSlug,
        textPreview: text.slice(0, 300),
      });
      throw new Error("Unparseable model output");
    }
    const days: ForecastDailyOutput[] = parsed.days
      .filter((d) => typeof d.date === "string")
      .map((d) => ({
        date: String(d.date),
        predictedOrders: Math.max(0, Math.round(Number(d.predicted_orders ?? 0))),
        lower: Math.max(0, Math.round(Number(d.lower ?? 0))),
        upper: Math.max(0, Math.round(Number(d.upper ?? d.predicted_orders ?? 0))),
      }));
    const result: ForecastResult = {
      source: "claude",
      generatedAt: new Date().toISOString(),
      days,
      reasoning: String(parsed.reasoning ?? "").slice(0, 500),
      cacheHit: false,
    };
    await setCacheJson(cacheKey, {
      fp,
      expiresAt: Date.now() + CACHE_TTL_MS,
      result,
    });
    return result;
  } catch (err) {
    // On failure we still return *something* useful so the UI doesn't
    // blank. Cache the MA result for a shorter window (1h) so we retry
    // the model on the next visit.
    logger.warn("ai.forecast.fallback_to_ma", { layer: "ai.forecast", locationSlug }, err);
    const result: ForecastResult = {
      source: "ma",
      generatedAt: new Date().toISOString(),
      days: fallbackForecast(series),
      reasoning: "",
      cacheHit: false,
    };
    await setCacheJson(cacheKey, {
      fp,
      expiresAt: Date.now() + 60 * 60 * 1000,
      result,
    });
    return result;
  }
}
