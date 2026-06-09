# CORE-V2 — Local-first foundation: delta sync, durable writes, normalized store

> **Status:** architecture design doc. Scopes the work to make CORE-V2 feel and
> behave like Square / Toast — instant UI, real-time sync, and writes that never
> drop or double-fire on a flaky network. Grounded in the current codebase
> (file references inline). Phase 1 (delta sync + client cache) ships
> incrementally; phases 2–3 (durable write queue + store normalization) are
> scoped here so the order they land in is deliberate, not accidental.
>
> Companion to `restaurant-os-blueprint.md` (the *why*); this is the *how the
> client/server substrate has to work* for any of it to feel professional.

---

## 0. The gap, in one paragraph

A real POS is **local-first**: the screen is driven by an in-memory source of
truth, the network reconciles in the background, and every write is a durable,
idempotent queue entry. CORE-V2 today is **request-per-action**: each screen
hand-rolls `fetch` + `setInterval`, re-pulls whole lists, and trusts the next
poll to be correct. That produces the three symptoms the audit found — lag,
the "disappears then reappears" poll-vs-write race, and brittleness when the
network blips. The audit pass (PR #157) bought us the *primitives*
(`usePolling`, an optimistic overlay in `useAdminOrdersStream`, scoped reads,
an auth cache). This doc takes them to the architecture they were a down-payment
on.

The three target invariants:

1. **The UI never waits on the network.** Every mutation is optimistic; the
   server reconciles.
2. **The client never trusts a poll over a local edit.** A single client cache
   per entity, reconciled by version, is the source of truth on screen.
3. **A write is never lost or double-applied.** Mutations are an idempotent,
   durable queue that survives reload and retries safely.

---

## 1. Where we are (the substrate today)

| Layer | Today | File |
|---|---|---|
| Realtime | SSE for orders (in-process emitter + 10 s backstop), **full-snapshot frames** | `src/app/api/admin/orders/stream/route.ts`, `src/lib/order-events.ts` |
| Client reads | Per-screen `fetch` + `setInterval`; now visibility-aware | `src/lib/usePolling.ts`, the `CoreV2*` components |
| Optimistic | Ad-hoc per screen; one generic overlay for orders | `useAdminOrdersStream.patchOrder` |
| Writes | Direct `fetch` → route → `store.ts`; no retry, no idempotency key | every `CoreV2*` mutation handler |
| Persistence | Mixed: `slots` / `orders` are **normalized tables**; tables, POS tabs, flags, settings are **whole-JSON blobs in `kv_store`** under a global lock | `src/lib/store.ts` |

The good news: the realtime path is already a hybrid emitter (sub-50 ms on the
write lambda), and there is exactly **one** browser consumer of the admin order
stream — `useAdminOrdersStream` — so the order pipeline can be upgraded
end-to-end without touching call sites.

---

## 2. Phase 1 — Delta sync + a single client cache (ships now)

**Goal:** the order pipeline (KDS, Orders, POS reads) becomes cache-driven and
delta-based, so screens re-render only the tickets that changed and the wire
carries diffs, not the whole list every frame.

### 2.1 Wire protocol (opt-in, backward-compatible)

`GET /api/admin/orders/stream?delta=1` emits tagged frames:

```
data: {"t":"snap","orders":[<full list>]}      // first frame
data: {"t":"delta","changed":[<orders>],"removed":[<ids>]}   // thereafter
```

The server keeps a per-connection `Map<id, signature>` and diffs each read
(`signature` = the serialized row). No `delta=1` → the legacy `data: [<array>]`
contract is untouched, so any future direct consumer is unaffected. Only the
hook opts in.

### 2.2 Client cache

`useAdminOrdersStream` becomes a small **id-keyed cache** (`Map<id, Order>`):

- `snap` → replace the map; `delta` → set changed / delete removed.
- REST fallback (`/api/admin/orders`) returns a full array → treated as a `snap`.
- The exposed `orders` is derived (sorted) from the map, with the existing
  **optimistic overlay** (`patchOrder`) applied on top and pruned once the
  server echoes the patch.

This is the reference implementation of the client-cache pattern; tabs / tables
/ slots adopt the same shape later (a generic `useEntityCache` extracted once it
has proven out on orders).

### 2.3 Why this first

Highest-traffic path (three screens read orders live), self-contained (one hook,
one route), and a real perf win on a busy service: a 60-ticket board stops
re-serializing and re-rendering 60 tickets every time one of them advances.

---

## 3. Phase 2 — Durable, idempotent write queue (the "never breaks" layer)

**Goal:** a WiFi blip mid-service never loses a ticket or double-charges.

### 3.1 Client write queue

A small persisted queue (Zustand + `localStorage`, mirroring `src/store/cart.ts`):

```
enqueue({ key: uuid(), entity, op, payload, attempts: 0 })
```

- Every mutation gets a **client-generated idempotency key** and is applied
  **optimistically** to the client cache before the network call.
- The queue drains in the background with exponential backoff; entries survive a
  reload. On success the optimistic state is confirmed; on terminal failure it
  rolls back with a toast.
- The queue is **ordered per entity** (a tab's edits apply in sequence) but
  parallel across entities.

### 3.2 Server idempotency

Mutation routes accept an `Idempotency-Key` header. A small `idempotency_keys`
table (key → result hash, TTL) makes a retried `POST /pos/orders` return the
**original** order instead of creating a second one. This is the single most
important correctness guarantee for money-handling on an unreliable network and
is what separates a toy POS from a real one.

### 3.3 Scope / risk

Touches every mutation handler, so it lands **after** Phase 1 proves the cache
shape. Start with the two money paths — POS send-to-KDS and charge — then
generalize.

---

## 4. Phase 3 — Finish store normalization (kills the server-side slowness)

**Goal:** remove the "read whole JSON blob → filter in memory → write whole blob
under a global lock" cost for the remaining entities.

`slots` and `orders` already prove the pattern (`src/db/schema.ts`,
dual-write + indexed reads). Migrate the hot blobs next, in this order:

1. **POS tabs** (`pos_tabs.json`) — written on every keystroke-debounce; the
   blob + global lock serialize concurrent tills. Highest contention.
2. **Floor tables** (`tables.json`) — read on every floor-twin build (15 s) and
   POS table picker.
3. **WhatsApp flags / sessions**, then settings.

Each migration: add the table + DDL (idempotent, like `SLOTS_DDL`), dual-write,
switch reads to indexed queries, drop the blob. The `withLock` global serialize
point disappears as the last blob leaves `kv_store`.

### 4.1 Connection / cold-start

Independently: keep Neon warm and pooled (the serverless HTTP driver cold-starts
add tail latency), and confirm `ensureDB` / `ensureTable` guard flags hold
across the warm instance (they do today). Add p95 interaction-latency
instrumentation so "fast" is a defended number, not a vibe.

---

## 5. Sequencing & exit criteria

| Phase | Lands | Exit criteria |
|---|---|---|
| **1 — delta sync + order cache** | now (this PR) | KDS/Orders re-render only changed tickets; stream payload is diffs; all three consumers green via the one hook |
| **2 — durable write queue** | next | POS send/charge survive a reload + offline blip with no loss / no double-charge (idempotency key proven) |
| **3 — normalization** | after | last hot blob (`pos_tabs`) off `kv_store`; floor-twin read is fully indexed; global `withLock` retired |

Phase 1 + 2 deliver the felt "instant like Square" + "never breaks like Toast".
Phase 3 is the backend foundation that makes both cheap to keep.

---

## 6. Non-goals (for now)

- Full offline catalog (menu/pricing) caching — the menu is already shipped to
  the client at load; revisit only if trucks run truly offline.
- Swapping the in-process emitter for Postgres `LISTEN/NOTIFY` — blocked on
  Neon's serverless driver (see `order-events.ts`); a persistent Node host makes
  it a drop-in later.
- CRDTs / multi-writer merge — per-entity ordered queues + idempotency cover the
  single-till-per-check reality; revisit only if two tills edit one check
  concurrently becomes common.
