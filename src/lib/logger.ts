import * as Sentry from "@sentry/nextjs";
import { getRequestContext } from "@/lib/request-context";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

/**
 * Emits a single JSON line per log event. JSON-per-line is the format Vercel,
 * Datadog, Logflare, and most modern log pipelines parse for free; it's also
 * grep-friendly when you're tailing locally.
 *
 * In production the line goes to stdout (via console.*) and, if a Sentry DSN
 * is configured, mirrors errors/warnings to Sentry with the same context as
 * `extra`. In development the JSON is pretty-printed so it's readable.
 */
function emit(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
  // Pull the active request context (m1_15) into every line. Caller-supplied
  // fields override request-context fields so an explicit `userId: "system"`
  // in a cron's logger.info() doesn't get overwritten by an enclosing
  // owner session.
  const reqCtx = getRequestContext();
  const entry = {
    level,
    msg: message,
    time: new Date().toISOString(),
    ...(reqCtx ? {
      requestId: reqCtx.requestId,
      ...(reqCtx.userId ? { userId: reqCtx.userId } : {}),
      ...(reqCtx.locationSlug ? { locationSlug: reqCtx.locationSlug } : {}),
      ...(reqCtx.path ? { path: reqCtx.path } : {}),
      ...(reqCtx.method ? { method: reqCtx.method } : {}),
    } : {}),
    ...(context || {}),
    ...(error instanceof Error
      ? { error: { name: error.name, message: error.message, stack: error.stack } }
      : error !== undefined
        ? { error }
        : {}),
  };

  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(entry)
      : JSON.stringify(entry, null, 2);

  // Always write to stdout / stderr — log shipping reads from there.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  // Mirror to Sentry when configured. Sentry no-ops if DSN is unset.
  if (level === "error") {
    if (error instanceof Error) Sentry.captureException(error, { extra: context });
    else Sentry.captureMessage(message, { level: "error", extra: { ...context, error } });
  } else if (level === "warn") {
    Sentry.captureMessage(message, { level: "warning", extra: context });
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext, error?: unknown) =>
    emit("warn", message, context, error),
  error: (message: string, context?: LogContext, error?: unknown) =>
    emit("error", message, context, error),
};
