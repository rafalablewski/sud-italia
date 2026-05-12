import Anthropic from "@anthropic-ai/sdk";
import type { FeedbackSentiment } from "@/lib/store";
import { logger } from "@/lib/logger";

const MODEL = "claude-haiku-4-5-20251001";

export interface SentimentBatchInput {
  id: string;
  rating: number;
  comment: string;
}

export interface SentimentResult {
  id: string;
  sentiment: FeedbackSentiment;
  themes: string[];
}

/**
 * Analyze a batch of feedback comments in a single Claude call. Returns one
 * result per input id. Items without a comment, or where the model can't
 * decide, fall back to neutral sentiment with no themes.
 *
 * Themes are normalized short tags ("dough quality", "speed", "staff
 * friendliness") suitable for grouping in the admin UI. We deliberately
 * cap to ≤ 3 per item so the trend panel stays scannable.
 *
 * Requires `ANTHROPIC_API_KEY` in the environment. If unset, the function
 * throws — callers should handle that and return a 503 to the admin.
 */
export async function analyzeFeedbackBatch(
  batch: SentimentBatchInput[],
): Promise<SentimentResult[]> {
  if (batch.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  // Cap the comment length to keep prompt size bounded — a 140-char tweet is
  // plenty of signal; reviews up to ~500 chars still fit comfortably.
  const items = batch.map((b) => ({
    id: b.id,
    rating: b.rating,
    comment: (b.comment || "").slice(0, 500),
  }));

  const system =
    "You are a customer-feedback analyst for a Polish pizza restaurant chain. " +
    "For each input, classify sentiment as 'positive' (the customer is happy), " +
    "'neutral' (mixed or factual), or 'negative' (clearly unhappy). " +
    "Extract up to 3 short normalized theme tags in English: 'dough quality', " +
    "'speed', 'staff friendliness', 'price', 'cleanliness', 'temperature', " +
    "'accuracy', 'app/ux', 'portion size', or similar. " +
    "Reply with ONLY a JSON array of {id, sentiment, themes}, no prose.";

  let raw = "";
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [
        {
          role: "user",
          content: `Analyze these ${items.length} feedback entries:\n\n${JSON.stringify(items)}`,
        },
      ],
    });
    raw = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch (err) {
    logger.error("Anthropic sentiment call failed", { batchSize: batch.length }, err);
    throw err;
  }

  // The model is instructed to return raw JSON, but be defensive against
  // surrounding prose just in case.
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    logger.warn("Sentiment response missing JSON array", { raw: raw.slice(0, 200) });
    return batch.map((b) => ({ id: b.id, sentiment: "neutral" as const, themes: [] }));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    logger.warn("Sentiment response failed to parse", { raw: raw.slice(0, 200) }, err);
    return batch.map((b) => ({ id: b.id, sentiment: "neutral" as const, themes: [] }));
  }

  if (!Array.isArray(parsed)) {
    return batch.map((b) => ({ id: b.id, sentiment: "neutral" as const, themes: [] }));
  }

  const validSentiments: ReadonlySet<FeedbackSentiment> = new Set([
    "positive",
    "neutral",
    "negative",
  ]);
  const byId = new Map<string, SentimentResult>();
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string") continue;
    const sentiment = validSentiments.has(r.sentiment as FeedbackSentiment)
      ? (r.sentiment as FeedbackSentiment)
      : "neutral";
    const themes = Array.isArray(r.themes)
      ? (r.themes.filter((t) => typeof t === "string") as string[]).slice(0, 3)
      : [];
    byId.set(r.id, { id: r.id, sentiment, themes });
  }

  // Ensure every input id gets a result so callers can always merge cleanly.
  return batch.map(
    (b) => byId.get(b.id) ?? { id: b.id, sentiment: "neutral" as const, themes: [] },
  );
}
