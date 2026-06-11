/**
 * AI model catalog + active-model resolution.
 *
 * The platform runs every LLM call through one gateway (src/lib/ai/gateway.ts).
 * Operators pick WHICH model that gateway talks to from this catalog — Claude
 * (Anthropic) or Gemini (Google) for now. The choice is persisted in the store
 * (ai-model.json) and read back at call time, so switching providers is a
 * single setting change with no redeploy.
 *
 * Each entry names the provider, the wire model id, and the env var that must
 * be set for that provider to actually answer. A model whose key is missing is
 * still selectable, but the gateway will surface a clear "needs-config" error
 * until the key lands — same degradation story as the rest of the AI OS.
 */

export type AiProvider = "anthropic" | "google";

export interface AiModel {
  /** Wire model id passed to the provider API. */
  id: string;
  provider: AiProvider;
  /** Human label for the picker. */
  label: string;
  /** One-line "when to pick this" hint. */
  hint: string;
  /** Env var that must be set for this provider to answer. */
  envVar: string;
}

/** The env var each provider authenticates with. */
export const PROVIDER_ENV_VAR: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
};

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
};

/**
 * The selectable models. Claude is the default; Gemini is the alternative.
 * Keep ids in sync with the cost table in cost.ts so budget math stays honest.
 */
export const AI_MODELS: AiModel[] = [
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    hint: "Most capable — best for agentic tool use and nuanced reasoning.",
    envVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    hint: "Balanced Claude — strong reasoning at lower cost than Opus.",
    envVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "claude-opus-4-7",
    provider: "anthropic",
    label: "Claude Opus 4.7",
    hint: "Prior Opus — kept for pinned configs.",
    envVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    hint: "Fast + cheap Claude — good for high-volume, simpler turns.",
    envVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "gemini-2.5-pro",
    provider: "google",
    label: "Gemini 2.5 Pro",
    hint: "Google's flagship — strong reasoning, large context.",
    envVar: "GEMINI_API_KEY",
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    label: "Gemini 2.5 Flash",
    hint: "Fast + cheap Gemini — good for high-volume, simpler turns.",
    envVar: "GEMINI_API_KEY",
  },
];

/** The model used when nothing is configured — Claude, the platform default. */
export const DEFAULT_AI_MODEL_ID = "claude-opus-4-8";

export function getModelById(id: string | undefined | null): AiModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/** Resolve an id (possibly stale/unknown) to a real catalog entry. */
export function resolveModel(id: string | undefined | null): AiModel {
  return getModelById(id) ?? getModelById(DEFAULT_AI_MODEL_ID)!;
}

export function isValidModelId(id: string | undefined | null): boolean {
  return !!getModelById(id);
}

/** Whether a provider's key is present in the environment (sync, env-only). */
export function providerConfigured(provider: AiProvider): boolean {
  return !!process.env[PROVIDER_ENV_VAR[provider]]?.trim();
}
