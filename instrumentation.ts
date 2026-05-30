import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook (Next 16 + @sentry/nextjs 10).
 *
 * Sentry's SDK no longer auto-loads `sentry.server.config.ts` /
 * `sentry.edge.config.ts` — without this `register()` the server-side
 * `Sentry.init()` never runs, so server errors (every uncaught 500, RSC
 * render failure, cron throw) silently never reach Sentry and the ">1% 5xx"
 * alert has no data. We import the right config per runtime here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Forwards server request errors (including React Server Component render
 * errors) to Sentry. This is what populates the error/5xx event stream that
 * the alerting rules in docs/runbooks/alerting.md key off.
 */
export const onRequestError = Sentry.captureRequestError;
