import * as Sentry from "@sentry/nextjs";

// Sentry.init is a no-op when DSN is unset, so this is safe to ship without
// a configured project — local dev and self-hosted deployments without an
// observability provider keep working as before.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // Capture 10% of transactions in prod, all in dev. Restaurants are not
    // high-traffic SaaS — full tracing in dev helps debugging, lower sample
    // in prod controls cost.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Replays are expensive — off by default; flip via env when triaging a
    // specific UX regression.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
