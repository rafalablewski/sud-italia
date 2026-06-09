// Phase 2b — durable write queue (outbox) decision logic.
// See docs/strategy/core-v2-local-first.md §3.1.
//
// Pure functions only: no React, no fetch, no localStorage. The Zustand store
// in src/store/writeQueue.ts is a thin shell over these so the ordering /
// backoff / terminal-vs-retry rules — the part that's easy to get subtly wrong
// and impossible to eyeball at 2am on a busy service — are unit-tested in
// isolation.

/** A pending mutation persisted to localStorage. Plain data only (it has to
 *  survive a reload, so no closures): the idempotency `key` makes a replay
 *  safe, `entity` is the FIFO ordering group (e.g. `tab:<id>`). */
export interface OutboxEntry {
  key: string;
  entity: string;
  url: string;
  method: string;
  body?: unknown;
  /** Human label for the status pill / toast ("Charge · tab #3"). */
  desc: string;
  attempts: number;
  /** Earliest epoch-ms this entry may be retried (backoff gate). */
  nextAt: number;
  enqueuedAt: number;
}

// Backoff for the durable queue. Longer than idempotentFetch's in-call transient
// retry — this is the "offline for a while" horizon — and capped at 60s so a
// long outage settles into a steady once-a-minute retry rather than ballooning.
export const OUTBOX_BACKOFF_MS = [1000, 4000, 15000, 60000];

export function backoffFor(attempts: number): number {
  return OUTBOX_BACKOFF_MS[Math.min(Math.max(attempts, 0), OUTBOX_BACKOFF_MS.length - 1)];
}

/**
 * The entries eligible to attempt right now: the FIFO **head of each entity
 * group** whose backoff gate has elapsed. One in-flight write per entity keeps
 * a single tab's edits strictly ordered (a charge never races its own send),
 * while different entities (different tabs / tills) drain in parallel.
 */
export function dueEntries(entries: OutboxEntry[], now: number): OutboxEntry[] {
  const headSeen = new Set<string>();
  const due: OutboxEntry[] = [];
  for (const e of entries) {
    // entries stay in enqueue order, so the first per entity IS its FIFO head.
    if (headSeen.has(e.entity)) continue;
    headSeen.add(e.entity);
    if (e.nextAt <= now) due.push(e);
  }
  return due;
}

export type WriteResult =
  | { kind: "ok" }
  | { kind: "rejected"; status: number } // 4xx — terminal, retrying won't help
  | { kind: "retry" }; // unreachable / 5xx — try again after backoff

/** Map an HTTP outcome to a queue action. `null` (server never reached) and 5xx
 *  are retryable; a 4xx is a definitive rejection we must stop replaying. */
export function classifyResponse(res: { ok: boolean; status: number } | null): WriteResult {
  if (!res) return { kind: "retry" };
  if (res.ok) return { kind: "ok" };
  if (res.status >= 400 && res.status < 500) return { kind: "rejected", status: res.status };
  return { kind: "retry" };
}

/** Fold a drain result back into the queue: drop the entry on a terminal
 *  outcome (success or rejection), or bump its attempt count + backoff gate on
 *  a retry. Pure — returns the next array, never mutates. */
export function applyResult(
  entries: OutboxEntry[],
  key: string,
  result: WriteResult,
  now: number,
): OutboxEntry[] {
  if (result.kind === "ok" || result.kind === "rejected") {
    return entries.filter((e) => e.key !== key);
  }
  return entries.map((e) =>
    e.key === key
      ? { ...e, attempts: e.attempts + 1, nextAt: now + backoffFor(e.attempts + 1) }
      : e,
  );
}
