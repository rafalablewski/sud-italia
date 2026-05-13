import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context that propagates through every async hop inside a
 * request (m1_15). Set once by the withAdmin middleware; read by the
 * logger so every JSON log line gets requestId / userId / locationSlug
 * for free — no need to thread them through every function signature.
 *
 * Why AsyncLocalStorage and not a request-scoped DI container? Next.js
 * route handlers are plain async functions; they call into shared
 * library code (store.ts, logger.ts) that has no knowledge of the
 * surrounding request. AsyncLocalStorage is the standard way to pass
 * implicit context across that boundary, runs on every modern Node
 * version we'd deploy to, and has near-zero overhead per call.
 */

export interface RequestContext {
  requestId: string;
  userId?: string;
  locationSlug?: string | null;
  /** Path the request was made against. Useful for grouping log lines. */
  path?: string;
  /** HTTP method. */
  method?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

/**
 * Generate a request id. Prefers an upstream `x-request-id` header so
 * Vercel / reverse-proxy traces can be correlated; falls back to a fresh
 * UUID. Length-bounded to 128 to keep log line widths sane.
 */
export function deriveRequestId(headerValue: string | null | undefined): string {
  if (headerValue) {
    const trimmed = headerValue.trim();
    if (trimmed.length > 0 && trimmed.length <= 128) return trimmed;
  }
  return crypto.randomUUID();
}
