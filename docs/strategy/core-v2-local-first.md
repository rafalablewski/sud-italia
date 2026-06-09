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

### 3.0 Status

- **2a — idempotency + transient retry — DONE.** Server `withIdempotency(key, fn)`
  (`src/lib/store.ts`): runs a mutation at most once per `Idempotency-Key`,
  serialized per key by the distributed lock, memoizing only successes (a 24 h
  read TTL covers any retry burst). Applied to the POS money routes
  (`POST` send / `PATCH` charge in `pos/orders/route.ts`) — a re-sent charge
  after a lost response now replays `{ ok, orderId, totalAmount }` instead of
  404-ing on the deleted tab, and never takes a second payment. Client
  `idempotentFetch` (`src/lib/idempotentFetch.ts`) attaches the key and retries
  transient failures (dropped connection / 5xx) with backoff; wired into POS
  send / fire / charge and the KDS bump. Covered by `idempotency.test.ts`.
- **2b — persisted offline queue — DONE.** A localStorage outbox
  (`src/store/writeQueue.ts` over the pure logic in
  `src/lib/writeQueue.core.ts`) survives a reload and drains on reconnect.
  Callers go through `durableMutate`, which keeps the **online** path identical
  to a plain idempotent fetch (so validation errors stay crisp and nothing is
  applied prematurely) and only parks a write in the queue when the network is
  **genuinely down** (`navigator.onLine === false`, or the fetch never lands).
  Parked writes replay **exactly once** under their idempotency key, **FIFO per
  entity** (`tab:<id>`) and parallel across entities, with capped exponential
  backoff. POS **send** and **charge** close the check optimistically when
  offline; a `↻ N writes syncing` pill on the check-bar shows pending writes.
  Covered by `writeQueue.core.test.ts` (ordering / backoff / terminal rules).

### 3.1 Client write queue (2b) — as shipped

A small persisted outbox (Zustand + `localStorage`, mirroring `src/store/cart.ts`):

```
enqueue({ key: uuid(), entity, url, method, body, attempts: 0, nextAt: 0 })
```

- Every mutation carries a **client-generated idempotency key**; the caller
  applies its **optimistic** update (e.g. close the check) when the write is
  parked offline.
- The outbox drains in the background with exponential backoff; entries survive a
  reload. On success it drops the entry (the server is now truth and the next
  data sync reconciles the UI); a terminal 4xx fires the caller's `onReject`
  toast.
- The outbox is **ordered per entity** (a tab's writes apply in sequence — the
  FIFO head of each entity group is the only one in flight) but parallel across
  entities.

### 3.2 Server idempotency

Mutation routes accept an `Idempotency-Key` header. `withIdempotency(key, fn)`
(`src/lib/store.ts`) stores each successful result under its own kv slot
(`idemp:<key>` — a Postgres `kv_store` row when `DATABASE_URL` is set, a file
in local dev, so no bespoke table or migration) with a 24h read TTL, and
serializes per key via the distributed lock. A retried `POST`/`PATCH /pos/orders`
returns the **original** result instead of creating a second order or taking a
second payment. This is the single most important correctness guarantee for
money-handling on an unreliable network and is what separates a toy POS from a
real one.

### 3.3 Scope / risk

Touches every mutation handler, so it lands **after** Phase 1 proves the cache
shape. Shipped on the two money paths first — POS send-to-KDS and charge (plus
the naturally-idempotent KDS bump) — then generalizes to the rest by reusing
`durableMutate` / `withIdempotency`.

---

## 4. Phase 3 — Finish store normalization (kills the server-side slowness)

**Goal:** remove the "read whole JSON blob → filter in memory → write whole blob
under a global lock" cost for the remaining entities.

`slots` and `orders` already prove the pattern (`src/db/schema.ts`,
dual-write + indexed reads). Migrate the hot blobs next, in this order:

1. **POS tabs** (`pos-tabs.json`) — written on every keystroke-debounce; the
   blob + global lock serialize concurrent tills. Highest contention.
2. **Floor tables** (`tables.json`) — read on every floor-twin build (15 s) and
   POS table picker.
3. **WhatsApp flags / sessions**, then settings.

Each migration: add the table + DDL (idempotent, like `SLOTS_DDL`), dual-write,
switch reads to indexed queries, drop the blob. The `withLock` global serialize
point disappears as the last blob leaves `kv_store`.

#### 4.0a POS tabs — per-location lock split (shipped)

> **Why not the full DB table first?** The DB path can't be exercised in the
> CI / sandbox (no `DATABASE_URL` there — it's validated only in the real Neon
> deploy), so shipping a normalized `pos_tabs` table that flips reads to indexed
> queries would land partly-unverified. The contention itself, though, is fixable
> *and fully verifiable* without a DB by splitting the blob key.

The single `pos-tabs.json` blob meant **every till at every truck serialized on
one `withLock`** — a Kraków keystroke-save blocked a Warszawa one. Open checks
are now keyed **per location** (`pos-tabs.<loc>.json`) and locked per location
(`withLockScoped("pos-tabs", loc)`), so different trucks never contend. For the
two-location chain this removes essentially all practical cross-till
serialization (`src/lib/store.ts`).

Migration is **lossless and self-draining**: pre-split checks left in the legacy
global blob are unioned into reads (per-location wins); any write that touches a
legacy check promotes it into its per-location key and drops it from legacy; new
checks never touch legacy, so the global blob drains to empty within a service
and is then never read or written again (a per-instance latch skips it once
empty). The upsert/validation rules were extracted to a pure `mergePosTab` and
unit-tested (`pos-tabs.test.ts`), and the legacy promote/drain path was verified
end-to-end against the FS store. The normalized `pos_tabs` **table** (with
indexed reads, validated in the real DB) remains the eventual end-state — this
split removes the contention now without that risk.

### 4.1 Connection / cold-start

Independently: keep Neon warm and pooled (the serverless HTTP driver cold-starts
add tail latency), and confirm `ensureDB` / `ensureTable` guard flags hold
across the warm instance (they do today). Add p95 interaction-latency
instrumentation so "fast" is a defended number, not a vibe.

---

## 5. Sequencing & exit criteria

| Phase | Lands | Exit criteria |
|---|---|---|
| **1 — delta sync + order cache** | shipped | KDS/Orders re-render only changed tickets; stream payload is diffs; all three consumers green via the one hook |
| **2a — idempotency + transient retry** | shipped | a re-sent charge replays its result (no double-charge / no 404); transient blips retry invisibly on send/charge/bump |
| **2b — persisted offline queue** | shipped | POS send/charge made offline survive a reload and replay exactly once (FIFO per tab) on reconnect; a "syncing" pill shows pending writes |
| **3 — POS tabs per-location lock split** | shipped | open checks keyed/locked per location (`pos-tabs.<loc>.json`); tills at different trucks no longer serialize on one lock; lossless self-draining legacy migration |
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
