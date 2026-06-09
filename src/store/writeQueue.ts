"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { idempotentFetch } from "@/lib/idempotentFetch";
import {
  dueEntries,
  classifyResponse,
  applyResult,
  type OutboxEntry,
} from "@/lib/writeQueue.core";

/**
 * Phase 2b — durable, idempotent write outbox.
 * See docs/strategy/core-v2-local-first.md §3.1.
 *
 * The shell around the pure logic in writeQueue.core.ts: a localStorage-persisted
 * Zustand store plus a background drain loop. Entries survive a reload, drain
 * with exponential backoff, retry safely under their idempotency key (so a
 * replay after a lost response never double-applies), and only ever fire one
 * write per entity at a time (FIFO per tab; parallel across tabs).
 *
 * Callers don't touch the store directly — they go through `durableMutate`,
 * which keeps the online happy-path identical to a plain fetch and only falls
 * back to the durable queue when the network is genuinely down.
 */

function safeLocalStorage(): StateStorage {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
  return {
    getItem: (n) => {
      try {
        return window.localStorage.getItem(n);
      } catch {
        return null;
      }
    },
    setItem: (n, v) => {
      try {
        window.localStorage.setItem(n, v);
      } catch {
        // Quota / private mode — a lost queue entry is the same risk as a
        // page that never loaded the queue; nothing we can do here.
      }
    },
    removeItem: (n) => {
      try {
        window.localStorage.removeItem(n);
      } catch {
        // ignore
      }
    },
  };
}

interface WriteQueueStore {
  entries: OutboxEntry[];
  enqueue: (e: Omit<OutboxEntry, "attempts" | "nextAt" | "enqueuedAt">) => void;
}

export const useWriteQueue = create<WriteQueueStore>()(
  persist(
    (set) => ({
      entries: [],
      enqueue: (e) =>
        set((s) => {
          if (s.entries.some((x) => x.key === e.key)) return s; // dedupe by key
          return {
            entries: [...s.entries, { ...e, attempts: 0, nextAt: 0, enqueuedAt: Date.now() }],
          };
        }),
    }),
    {
      name: "sud-italia-write-queue",
      storage: createJSONStorage(() => safeLocalStorage()),
      onRehydrateStorage: () => () => {
        // Re-arm the loop for entries that outlived a reload.
        ensureLoop();
        void drainOnce();
      },
    },
  ),
);

// --- Settled-handler registry (not persisted) ----------------------------
// Callers register what to do when *their* write finally lands or is rejected.
// Handlers are closures, so they don't survive a reload — that's fine: after a
// reload the write still drains (idempotency keeps it safe) and the UI
// reconciles from the server on the next sync. Handlers are a live-session nicety
// (toast on rejection), never a correctness dependency.
type SettledHandlers = { onSuccess?: () => void; onReject?: (status: number) => void };
const handlers = new Map<string, SettledHandlers>();

export function onWriteSettled(key: string, h: SettledHandlers): void {
  handlers.set(key, h);
}

// --- Drain loop ----------------------------------------------------------
const inFlight = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;
let onlineHooked = false;

async function drainOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const due = dueEntries(useWriteQueue.getState().entries, now).filter((e) => !inFlight.has(e.key));
  await Promise.all(
    due.map(async (e) => {
      inFlight.add(e.key);
      try {
        const { res } = await idempotentFetch(e.url, { method: e.method, body: e.body, key: e.key });
        const result = classifyResponse(res);
        useWriteQueue.setState((s) => ({ entries: applyResult(s.entries, e.key, result, Date.now()) }));
        if (result.kind === "ok") {
          handlers.get(e.key)?.onSuccess?.();
          handlers.delete(e.key);
        } else if (result.kind === "rejected") {
          handlers.get(e.key)?.onReject?.(result.status);
          handlers.delete(e.key);
        }
        // retry: leave the entry + handler for the next pass.
      } finally {
        inFlight.delete(e.key);
      }
    }),
  );
}

function ensureLoop(): void {
  if (typeof window === "undefined") return;
  if (!onlineHooked) {
    onlineHooked = true;
    // Reconnect → drain immediately rather than waiting out the interval.
    window.addEventListener("online", () => void drainOnce());
  }
  if (timer) return;
  timer = setInterval(() => {
    if (useWriteQueue.getState().entries.length === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      return;
    }
    void drainOnce();
  }, 2000);
}

/** Push a write into the durable outbox and start draining. */
function enqueueDurable(
  e: Omit<OutboxEntry, "attempts" | "nextAt" | "enqueuedAt">,
  h?: SettledHandlers,
): void {
  if (h) onWriteSettled(e.key, h);
  useWriteQueue.getState().enqueue(e);
  ensureLoop();
  void drainOnce();
}

export interface DurableMutateOptions {
  url: string;
  method: string;
  body?: unknown;
  /** FIFO ordering group — same-entity writes never overlap (use `tab:<id>`). */
  entity: string;
  /** Human label for the status pill / toast. */
  desc: string;
  onSuccess?: () => void;
  onReject?: (status: number) => void;
}

export interface DurableMutateResult {
  /** The server response, or `null` when the write was parked in the queue. */
  res: Response | null;
  key: string;
  /** True when the write went to the durable queue (offline) instead of
   *  resolving online. `queued === true` ⟺ `res === null`. */
  queued: boolean;
}

/**
 * Mutate with a durable, offline-surviving fallback.
 *
 *  - **Online** (the common case): behaves like a normal idempotent fetch — a
 *    transient blip retries invisibly, and a real response (2xx *or* 4xx) comes
 *    straight back, so validation errors stay crisp and nothing is optimistically
 *    applied prematurely.
 *  - **Offline** (`navigator.onLine === false`, or the fetch never reaches the
 *    server): the write is parked in the persisted outbox under its idempotency
 *    key and `queued: true` is returned immediately, so the caller can apply its
 *    optimistic update and move on. The outbox replays it — exactly once — when
 *    connectivity returns, even across a reload.
 */
export async function durableMutate(opts: DurableMutateOptions): Promise<DurableMutateResult> {
  const { url, method, body, entity, desc, onSuccess, onReject } = opts;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (!offline) {
    const { res, key } = await idempotentFetch(url, { method, body });
    if (res) return { res, key, queued: false };
    // Reached here = network failure after retries. Park it under the same key
    // (a false-negative where the request actually landed replays as a no-op).
    enqueueDurable({ key, entity, url, method, body, desc }, { onSuccess, onReject });
    return { res: null, key, queued: true };
  }

  const key = crypto.randomUUID();
  enqueueDurable({ key, entity, url, method, body, desc }, { onSuccess, onReject });
  return { res: null, key, queued: true };
}

/** Live count of writes still waiting to land — drives the POS "syncing" pill. */
export function usePendingWriteCount(): number {
  return useWriteQueue((s) => s.entries.length);
}
