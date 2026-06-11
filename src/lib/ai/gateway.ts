import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { incrCounter, recordHistogram } from "@/lib/metrics";
import { getAiModelSettings } from "@/lib/store";
import { providerConfigured, resolveModel, type AiModel } from "./models";

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

/**
 * True when AT LEAST ONE provider (Claude or Gemini) has its key set, so the
 * AI surfaces can light up. The actual provider used per call is resolved from
 * the operator's model selection; if the active provider's key is missing, the
 * call throws a clear "needs-config" error the UI surfaces.
 */
export function gatewayConfigured(): boolean {
  return providerConfigured("anthropic") || providerConfigured("google");
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
  // Resolve the active model: an explicit opts.model wins (callers that pin a
  // model), otherwise the operator's persisted selection, otherwise the
  // platform default (Claude). The provider routes the call.
  const selected = opts.model ?? (await getAiModelSettings()).modelId ?? undefined;
  const model = resolveModel(selected);
  if (model.provider === "google") {
    return callGemini(opts, model);
  }
  return callAnthropic(opts, model.id);
}

async function callAnthropic(opts: GatewayCallOptions, modelId: string): Promise<GatewayCallResult> {
  const client = getClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const start = Date.now();
  const model = modelId;

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

/* ---------------------------------------------------------------------------
 * Gemini (Google) provider.
 *
 * We keep the whole platform in Anthropic's message shape internally and
 * translate at this boundary, so a provider switch is transparent to the agent
 * loop, the Boardroom, and the conversation store. The call goes over the
 * Generative Language REST API (no extra SDK dependency); request + response —
 * including function (tool) calls — are translated both ways.
 * ------------------------------------------------------------------------- */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent { role: "user" | "model"; parts: GeminiPart[] }

/**
 * Strip JSON-Schema fields Gemini's function-declaration schema rejects, and
 * normalise nullable union types. Gemini's schema validation doesn't accept an
 * array `type` (e.g. `["string", "null"]` for optional fields) — it wants a
 * single type plus `nullable: true`, so we rewrite those.
 */
function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "$schema" || k === "additionalProperties" || k === "default") continue;
    if (k === "type" && Array.isArray(v)) {
      const nonNull = v.filter((t) => t !== "null");
      out.type = nonNull[0] ?? "string";
      if (v.includes("null")) out.nullable = true;
      continue;
    }
    out[k] = sanitizeSchema(v);
  }
  return out;
}

/** Anthropic tool_result content (a JSON string in our code) → an object. */
function toResponseObject(content: unknown): Record<string, unknown> {
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { result: parsed };
    } catch {
      return { result: content };
    }
  }
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  return { result: content };
}

/** Translate the running Anthropic message list into Gemini `contents`. */
function toGeminiContents(messages: Anthropic.MessageParam[]): GeminiContent[] {
  // tool_use id → function name, so a later tool_result can name its function.
  const idToName = new Map<string, string>();
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === "tool_use") idToName.set(b.id, b.name);
      }
    }
  }

  const contents: GeminiContent[] = [];
  for (const m of messages) {
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    const parts: GeminiPart[] = [];
    if (typeof m.content === "string") {
      if (m.content.trim()) parts.push({ text: m.content });
    } else {
      for (const b of m.content) {
        if (b.type === "text") {
          if (b.text.trim()) parts.push({ text: b.text });
        } else if (b.type === "tool_use") {
          parts.push({ functionCall: { name: b.name, args: (b.input as Record<string, unknown>) ?? {} } });
        } else if (b.type === "tool_result") {
          parts.push({
            functionResponse: {
              name: idToName.get(b.tool_use_id) ?? "tool",
              response: toResponseObject(b.content),
            },
          });
        }
      }
    }
    if (parts.length > 0) contents.push({ role, parts });
  }
  return contents;
}

function mapGeminiFinish(reason: string | undefined, hasTool: boolean): string {
  if (hasTool) return "tool_use";
  if (reason === "MAX_TOKENS") return "max_tokens";
  return "end_turn";
}

async function callGemini(opts: GatewayCallOptions, model: AiModel): Promise<GatewayCallResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const start = Date.now();
  const body: Record<string, unknown> = {
    contents: toGeminiContents(opts.messages),
    generationConfig: { maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: sanitizeSchema(t.input_schema),
        })),
      },
    ];
  }

  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(model.id)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      promptFeedback?: { blockReason?: string };
    };

    // Gemini can return 200 OK with no candidates when the prompt is blocked by
    // a safety filter — surface that explicitly rather than returning a silent
    // empty turn (which would look like a normal end_turn).
    if (!json.candidates || json.candidates.length === 0) {
      if (json.promptFeedback?.blockReason) {
        throw new Error(`Gemini prompt blocked by safety filters: ${json.promptFeedback.blockReason}`);
      }
      throw new Error("Gemini API returned an empty response with no candidates.");
    }

    const parts = json.candidates[0]?.content?.parts ?? [];
    const content: Anthropic.ContentBlock[] = [];
    let toolIdx = 0;
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.length > 0) {
        content.push({ type: "text", text: part.text, citations: null } as Anthropic.TextBlock);
      } else if (part.functionCall) {
        content.push({
          type: "tool_use",
          id: `gem_${Date.now().toString(36)}_${toolIdx++}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        } as Anthropic.ToolUseBlock);
      }
    }
    const hasTool = content.some((b) => b.type === "tool_use");
    const stopReason = mapGeminiFinish(json.candidates?.[0]?.finishReason, hasTool);

    const usage = {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };

    const message = {
      id: `gemini_${Date.now().toString(36)}`,
      type: "message",
      role: "assistant",
      model: model.id,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    } as unknown as Anthropic.Message;

    const elapsed = Date.now() - start;
    recordHistogram(`ai.latency_ms.${opts.feature}`, elapsed);
    incrCounter(`ai.calls.${opts.feature}`, 1);
    incrCounter(`ai.input_tokens.${opts.feature}`, usage.inputTokens);
    incrCounter(`ai.output_tokens.${opts.feature}`, usage.outputTokens);
    logger.info("ai.gateway.call", {
      layer: "ai.gateway",
      feature: opts.feature,
      model: model.id,
      latencyMs: elapsed,
      stopReason,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return { message, usage };
  } catch (err) {
    incrCounter(`ai.errors.${opts.feature}`, 1);
    logger.error("ai.gateway.error", { layer: "ai.gateway", feature: opts.feature, model: model.id }, err);
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
