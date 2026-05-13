/**
 * Lightweight in-process metrics (m1_14). Counters + histograms tracked in
 * memory; surfaced via /api/admin/health alongside the lock + lazyBackfill
 * snapshots.
 *
 * Why not Sentry/Datadog/Prometheus? Phase 1 doesn't require a vendor
 * dependency — operators can scrape /api/admin/health from any
 * uptime/observability tool. Phase 4 can pipe these into Sentry's
 * `Sentry.metrics` API or a real time-series backend when the chain
 * grows past a single fleet of lambdas.
 *
 * Per-lambda scope: each Node process tracks its own metrics. With many
 * concurrent lambdas the operator sees one slice at a time; aggregating
 * is the job of the external system. That's fine for the alerting use
 * cases the audit called out — anomalies show up everywhere a problem
 * exists, so any one lambda's snapshot is representative.
 */

interface CounterState {
  value: number;
}

interface HistogramState {
  count: number;
  sum: number;
  min: number;
  max: number;
  // Reservoir of recent samples for approximate p50/p95. Small enough that
  // a busy lunch's worth of admin-api calls fits without GC pressure.
  reservoir: number[];
}

const RESERVOIR_SIZE = 256;

const counters = new Map<string, CounterState>();
const histograms = new Map<string, HistogramState>();
// Start time for "metrics since process boot" tooltip in the health UI.
const startedAt = Date.now();

function getOrInitCounter(name: string): CounterState {
  let c = counters.get(name);
  if (!c) {
    c = { value: 0 };
    counters.set(name, c);
  }
  return c;
}

function getOrInitHistogram(name: string): HistogramState {
  let h = histograms.get(name);
  if (!h) {
    h = {
      count: 0,
      sum: 0,
      min: Number.POSITIVE_INFINITY,
      max: 0,
      reservoir: [],
    };
    histograms.set(name, h);
  }
  return h;
}

/** Increment a counter by 1 (or `by`). */
export function incrCounter(name: string, by = 1): void {
  const c = getOrInitCounter(name);
  c.value += by;
}

/** Record a single histogram sample (typically a duration in ms). */
export function recordHistogram(name: string, value: number): void {
  if (!Number.isFinite(value)) return;
  const h = getOrInitHistogram(name);
  h.count += 1;
  h.sum += value;
  if (value < h.min) h.min = value;
  if (value > h.max) h.max = value;
  if (h.reservoir.length < RESERVOIR_SIZE) {
    h.reservoir.push(value);
  } else {
    // Reservoir sampling: each new sample has a 1/N chance of replacing
    // a uniformly-chosen existing one. Keeps the reservoir representative
    // of the long-run distribution without growing unbounded.
    const j = Math.floor(Math.random() * h.count);
    if (j < RESERVOIR_SIZE) h.reservoir[j] = value;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  counters: Record<string, number>;
  histograms: Record<
    string,
    { count: number; meanMs: number; minMs: number; maxMs: number; p50Ms: number; p95Ms: number }
  >;
}

export function snapshotMetrics(): MetricsSnapshot {
  const c: Record<string, number> = {};
  for (const [name, state] of counters) c[name] = state.value;
  const h: MetricsSnapshot["histograms"] = {};
  for (const [name, state] of histograms) {
    const sorted = [...state.reservoir].sort((a, b) => a - b);
    h[name] = {
      count: state.count,
      meanMs: state.count > 0 ? state.sum / state.count : 0,
      minMs: state.count > 0 ? state.min : 0,
      maxMs: state.max,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
    };
  }
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: c,
    histograms: h,
  };
}

/** Test-only reset. */
export function _resetMetricsForTests(): void {
  counters.clear();
  histograms.clear();
}
