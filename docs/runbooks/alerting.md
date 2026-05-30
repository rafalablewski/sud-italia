# Alerting runbook

How errors and degradations reach a human. The code-side plumbing lives in
the repo; the **thresholds** are configured in the Sentry dashboard (they
can't be committed). This doc is the source of truth for which rules to
create and why.

## How errors reach Sentry

- `instrumentation.ts` (`register()`) loads `sentry.server.config.ts` /
  `sentry.edge.config.ts` per runtime. Without it the server-side
  `Sentry.init()` never runs — server errors would never be reported.
- `onRequestError = Sentry.captureRequestError` forwards every server request
  error (uncaught 500s, RSC render failures, cron throws) to Sentry.
- `src/lib/logger.ts` mirrors `logger.error(...)` → `Sentry.captureException`
  and `logger.warn(...)` → `Sentry.captureMessage(level: "warning")`, with the
  per-request context (requestId / userId / locationSlug / path / method)
  attached as `extra`.
- `withAdmin` (`src/lib/api-middleware.ts`) wraps the catch-all 500 in
  `logger.error`, so any admin route that throws is captured.

## Configuration

Set in every deployed environment (Vercel → Settings → Environment Variables):

| Var | Purpose |
| --- | --- |
| `SENTRY_DSN` (or `NEXT_PUBLIC_SENTRY_DSN`) | Enables Sentry. When unset, all capture calls no-op — safe for local/dev. |

`tracesSampleRate` is 0.1 in production, 1.0 elsewhere (`sentry.*.config.ts`).

## Alert rules to create in Sentry

### 1. Error rate > 1% of requests (5xx)

- **Type:** Metric alert on the error event count vs. request throughput
  (Sentry → Alerts → Create → "Number of Errors" / "Failure rate").
- **Condition:** failure rate `> 1%` over a 5-minute window.
- **Why:** the SLO is <1% 5xx. `onRequestError` + the `withAdmin` catch-all
  ensure the numerator is populated.
- **Action:** page on-call; check the most frequent `path` tag, then the
  Vercel function logs for that route.

### 2. Lock acquisition failure / fallback

Two distinct signals, both from `src/lib/locks.ts`:

- **`lock.timeout`** — `logger.warn("withDistributedLock acquire timeout", …)`
  then throws. Also bumps the `lock.timeouts` counter (surfaced at
  `/api/admin/health`).
- **`lock.fallback`** — `logger.error(… alert: "lock.fallback")` when Redis is
  "broken" and we drop to an in-process lock. Bumps `lock.fallbacks` +
  `metrics.inProcessFallbacks`. **This opens a cross-instance race window**, so
  it is logged at `error` level.

- **Type:** Issue alert filtered to messages containing
  `withDistributedLock` (or the `alert` extra equal to `lock.fallback`).
- **Condition:** any occurrence in production (these should be ~zero when
  Upstash is healthy).
- **Action:** verify `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are
  set and Upstash is reachable; a sustained stream means slot oversell and
  idempotency guarantees are degraded.

## Verifying the wiring

1. `SENTRY_DSN` set in the target environment.
2. Trigger a deliberate server error on a preview deploy and confirm it lands
   in Sentry with the `path`/`requestId` tags.
3. Confirm `/api/admin/health` reports `lock.timeouts` / `lock.fallbacks`
   counters (the same signals the alerts key off).
