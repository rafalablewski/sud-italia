import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { incrCounter, recordHistogram } from "@/lib/metrics";

/**
 * LLM gateway (m4_1). Every Claude call in the platform goes through
 * here so we get:
 *   - a single place to pick model + thinking + effort defaults,
 *   - prompt caching on the system block (cheap repeats),
 *   - per-feature cost attribution via the `feature` tag on metrics,
 *   - prompt-injection guardrails — operator/customer text is wrapped
 *     in `<user_text>...</user_text>` so the model can be told to
 *     ignore instructions inside that fence,
 *   - graceful no-op when `ANTHROPIC_API_KEY` is unset (mirrors the
 *     SMS / email provider story; the agent UI degrades to "not
 *     configured" instead of crashing).
 *
 * Model defaults match what the claude-api skill recommends for
 * agentic ops work on a live operator console:
 *   - Opus 4.7 (latest GA at time of writing)
 *   - adaptive thinking with summarized display so the operator can
 *     see Claude reasoning in the UI
 *   - effort: "high" (token-efficient sweet spot for ops tools)
 */

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_TOKENS = 4096;

export interface GatewayCallOptions {
  feature: string;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  thinking?: "adaptive" | "off";
}

export interface GatewayCallResult {
  message: Anthropic.Message;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

let cachedClient: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (cachedClient !== undefined) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    cachedClient = null;
    return null;
  }
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

export function gatewayConfigured(): boolean {
  return getClient() !== null;
}

/**
 * Wrap operator / customer text in a fence so the system prompt can
 * tell Claude to treat that segment as data rather than instructions.
 * Cheap defence against the basic "ignore previous instructions"
 * prompt-injection class. Not a substitute for role gates on the
 * tool side.
 */
export function fenceUserContent(label: string, content: string): string {
  const safe = content.replace(/<\/user_text>/g, "</user_text_ESCAPED>");
  return `<user_text label="${label}">\n${safe}\n</user_text>`;
}

export async function callGateway(opts: GatewayCallOptions): Promise<GatewayCallResult> {
  const client = getClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const start = Date.now();
  const model = opts.model ?? DEFAULT_MODEL;

  // System prompt cached so repeat operator turns reuse the prefix.
  // Anthropic prefix-match cache invalidates on any byte change, so
  // callers should keep the system string stable across a session.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: opts.system,
      cache_control: { type: "ephemeral" },
    },
  ];

  try {
    const message = (await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: systemBlocks,
      messages: opts.messages,
      tools: opts.tools,
      stream: false,
      ...(opts.thinking === "off"
        ? {}
        : { thinking: { type: "adaptive", display: "summarized" } }),
      output_config: { effort: opts.effort ?? "high" },
    } as Anthropic.MessageCreateParams)) as Anthropic.Message;

    const elapsed = Date.now() - start;
    const usage = {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
    };

    recordHistogram(`ai.latency_ms.${opts.feature}`, elapsed);
    incrCounter(`ai.calls.${opts.feature}`, 1);
    incrCounter(`ai.input_tokens.${opts.feature}`, usage.inputTokens);
    incrCounter(`ai.output_tokens.${opts.feature}`, usage.outputTokens);
    incrCounter(`ai.cache_read_tokens.${opts.feature}`, usage.cacheReadTokens);

    logger.info("ai.gateway.call", {
      layer: "ai.gateway",
      feature: opts.feature,
      model,
      latencyMs: elapsed,
      stopReason: message.stop_reason,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return { message, usage };
  } catch (err) {
    incrCounter(`ai.errors.${opts.feature}`, 1);
    logger.error("ai.gateway.error", { layer: "ai.gateway", feature: opts.feature, model }, err);
    throw err;
  }
}

/**
 * Pull plain text out of a Messages API response. Convenience helper
 * for code paths that don't need to inspect tool-use blocks.
 */
export function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
