# Ottaviano Native Platform — Architecture & Technical Specification

> **⚠️ Stack superseded (2026-06-30).** This doc was authored for a **SwiftUI**
> client (Swift 6, SwiftPM, `@Observable`, SwiftData/GRDB, `NavigationSplitView`).
> That stack was retired; the apps are now **bare React Native 0.79.5** in
> [`native/ottaviano-rn`](../../native/ottaviano-rn) (rendering decision: **100%
> native, no WebView** — see [`IOS-WEB-MIRROR.md`](./IOS-WEB-MIRROR.md)). Read the
> **backend-as-API (§2), offline-first principles (§4), networking contract (§5),
> security (§8), and performance budgets (§9)** as current — they're stack-agnostic
> — and the **Swift-specific mechanics (§3, §6, §7, the SwiftPM module layout) as
> design intent**, re-expressed in RN by `native/ottaviano-rn/README.md`.

> **Stage 1 of the staged rewrite.** This document is the contract everything
> downstream is built against: design system, navigation shell, infrastructure,
> then feature-by-feature implementation. It is written to be argued with.
> Where a decision is genuinely the owner's, it is flagged **[DECISION]** and
> listed in §13.

**Status:** §13 decisions signed off (2026-06-26) — see §13 · **Author role:** Founding iOS Staff Engineer / Principal Architect
**Targets:** iPhone + iPad, universal · iOS 26 (latest stable) minimum · Swift 6, strict concurrency

---

## 0. Ground truth & constraints (read first)

Two facts shape every decision below.

1. **The problem is the client tier, not the server.** Ottaviano already runs a
   complete backend: Neon Postgres, cookie/JWT admin auth, 238 API routes, an
   order/KDS/loyalty/inventory domain model, **server-sent-event streams already
   live** for orders and the kitchen (`/api/orders/stream`,
   `/api/admin/orders/stream`, `/api/kitchen/orders/stream`). "It feels like a
   website" is a verdict on the React/Next **UI**, not on this backend. The
   rewrite replaces the UI tier with two native apps and **keeps the backend as
   the API**. Rewriting the server is a multi-year detour orthogonal to "feels
   native" — explicitly out of scope (§13, Decision A).

2. **iOS cannot be built or run in the web dev container.** SwiftUI/UIKit and the
   simulator are macOS-only. All Swift in this repo is authored as a spec/source
   artifact and **compiled, run, and tested by the team in Xcode on a Mac**. CI
   for the native apps runs on macOS runners (§11), separate from the existing
   web CI. We never claim a native build "works" from this container.

**Honest scope-setting.** A Toast/Square-class platform is a multi-year, multi-
engineer effort. This spec makes that journey *tractable*: a backend we don't
rewrite, a module system where features are built and shipped independently, and
an offline-first core so a POS keeps selling when the Wi-Fi dies. We build the
spine to run one restaurant beautifully now, and to scale to thousands without
re-founding the architecture.

---

## 1. System topology

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  Ottaviano (Customer)   │     │  OttavianoKDS (Operator)│
│  iPhone-first, iPad OK   │     │  iPad-first, iPhone OK   │
│  SwiftUI · offline-lite  │     │  SwiftUI · offline-first │
└───────────┬─────────────┘     └───────────┬─────────────┘
            │   HTTPS / JSON (typed client)  │
            │   SSE (orders, KDS, presence)  │
            └───────────────┬────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │  Existing Next.js backend (unchanged   │
        │  domain) exposed as a versioned API     │
        │  · 238 route handlers → /api/v1/*       │
        │  · Neon Postgres · Upstash · Stripe     │
        │  · SSE streams · web-push               │
        └───────────────────────────────────────┘
```

The two apps **share a Swift package of domain + infrastructure code** (`OttavianoKit`)
and **diverge only at the feature/UI layer**. Customer and Operator are different
products with different data-access scopes, not one app with a role flag.

---

## 2. The central architectural decision: backend as a stable API

### Audit of today
The web clients talk to Next routes that were designed for a *coupled* React
client: some return HTML-adjacent shapes, some lean on cookies, error shapes are
inconsistent, and there is no version pin. A native app cannot depend on an
endpoint whose contract can change with a UI refactor.

### What's wrong
- **No contract boundary.** Native binaries live in the App Store for weeks; a
  silent server shape-change ships a broken app to every device at once.
- **Cookie session model.** Native apps want a token they control in the Keychain,
  with an explicit refresh flow — not an implicit browser cookie.
- **Inconsistent envelopes.** Mixed success/error shapes make a generic typed
  client impossible and push parsing complexity into every call site.

### The architecture
Introduce a **versioned API facade**: `/api/v1/*` thin handlers that wrap the
existing domain/store functions and emit a single envelope:

```jsonc
// success                         // error
{ "data": { … }, "meta": { … } }   { "error": { "code": "ORDER_CONFLICT",
                                                  "message": "…",
                                                  "details": { … } } }
```

- **Additive-only within a major version.** Breaking changes mint `/api/v2`.
  The app sends `Accept: application/vnd.ottaviano.v1+json`; the server can warn
  on a soon-deprecated version via `meta.deprecation`.
- **Auth:** short-lived access JWT (15 min) + rotating refresh token. Access token
  in memory; refresh token in **Keychain** (`kSecAttrAccessibleAfterFirstUnlock`,
  this-device-only). Reuses the existing `admin-auth` user/role model — we add
  a token endpoint, we do not rebuild identity.
- **One generated source of truth for types.** The contract is described once
  (Zod schemas already exist server-side) and the **Swift `Codable` models are
  generated from it** so the wire types cannot drift from the app's models
  (§5). **[DECISION B]** OpenAPI-from-Zod vs hand-authored contract package.

> **Why not GraphQL?** The domain is REST-shaped and already 238 endpoints deep.
> A v1 facade reuses that investment in days; a GraphQL layer is a quarter of work
> for marginal client benefit at this stage. Revisit at multi-tenant scale.

### 2.1 Host portability — the Vercel exit (signed-off constraint)
The backend stays, **but it will leave Vercel 100%**. The `/api/v1` facade is
therefore designed host-agnostic from day one so the native apps never feel the
migration:

- **The contract is the firewall.** Apps depend only on `/api/v1` + the JWT/SSE
  semantics — never on a hostname, a Vercel feature, or a deploy detail. Move the
  origin behind the same contract (just repoint the base URL / DNS) and the
  shipped apps keep working. This is *why* the versioned facade matters even more
  given the exit.
- **No Vercel-only primitives on the critical path.** Avoid coupling to Vercel
  Edge Middleware, Vercel Cron, Vercel KV/Blob, or Image Optimization as
  load-bearing. The app already abstracts persistence (`readJSON`/`writeJSON` over
  Neon **or** filesystem) and locks/rate-limits over Upstash — keep that
  portability. Target a **portable runtime**: the Next app as a self-hostable
  Node server (`output: "standalone"`) in a container, or a small dedicated API
  service, behind any reverse proxy.
- **Portable equivalents to line up before the cutover:** cron dispatcher
  (Vercel Cron → a container scheduler / Postgres-backed queue), object storage
  (→ S3-compatible, already used for backups), edge/CDN (→ any CDN), and a
  config/secrets story that isn't Vercel env-only. Tracked as a pre-cutover
  checklist in a future `docs/native/VERCEL-EXIT.md` (Stage 2+).
- **Base-URL & cert agility in the app:** the `APIClient` reads its origin from a
  signed remote config with a baked-in fallback, and pinning is to a SPKI we
  control (not a Vercel-managed leaf), so DNS/host moves need no App Store release.

---

## 3. App architecture — feature modules over a thin core

### Pattern: **MV + Observation**, not MVVM-for-its-own-sake
SwiftUI + the Observation framework (`@Observable`) collapses the need for a
ViewModel-per-View. We use:

- **`@Observable` feature stores** (one per feature area, e.g. `OrdersStore`,
  `MenuStore`) holding state + intent methods. Not "God objects": a store owns
  *one* bounded context and is composed from services.
- **Views are pure projections** of store state. A View never does I/O, never
  formats currency by hand, never knows a URL. Large screens decompose into small
  `View` structs that each take the slice of state they render.
- **Services** (`protocol`-fronted) do the actual work: `OrderService`,
  `SyncEngine`, `PaymentService`. Injected, never singletons-by-default.

### Dependency injection
Lightweight, compile-checked DI via an environment container — no heavyweight DI
framework. A `Dependencies` struct of protocols is provided at the composition
root and flows through SwiftUI `Environment`. Tests inject fakes by constructing
`Dependencies` with stubs. **Actors** guard concurrency-sensitive services (the
`SyncEngine`, the write outbox) so data races are impossible by construction
under Swift 6 strict concurrency.

### Module layout (SwiftPM, one workspace, many packages)
```
OttavianoPlatform/                  (Xcode workspace)
├── Apps/
│   ├── Ottaviano/                  customer app target (composition root only)
│   └── OttavianoKDS/               operator app target (composition root only)
├── Packages/
│   ├── OttavianoKit/               umbrella: re-exports the below
│   │   ├── DesignSystem/           tokens, components, motion, haptics (Stage 2)
│   │   ├── CoreModels/             generated Codable domain types
│   │   ├── Networking/             typed APIClient, auth, retry, SSE
│   │   ├── Persistence/            SwiftData/GRDB store + migrations
│   │   ├── Sync/                   offline outbox + conflict resolution
│   │   └── AppInfra/               logging, feature flags, analytics, errors
│   └── Features/
│       ├── Menu/  Ordering/  Loyalty/  Wallet/  Reservations/   (customer)
│       └── POS/  KDS/  Tables/  Inventory/  Reporting/  Staff/   (operator)
└── Tooling/  (contract codegen, lint, danger)
```
**Rule:** an app target contains *almost no code* — it wires features together.
A feature depends on Kit, never on another feature directly; cross-feature flow
goes through a typed `AppRouter` (§ navigation). This is what makes "thousands of
screens" maintainable: each feature compiles, tests, and is owned independently.

---

## 4. Offline-first & sync — the hardest and most important part

A restaurant POS that stops taking orders when the internet hiccups is
unacceptable. This is the single biggest reason the web app "feels like a
website" under real conditions.

### Principles
- **Local store is the source of truth for the UI.** The app *always* reads/writes
  the on-device database; the network is a background synchronizer, never on the
  critical path of a tap. (This is the Linear/Things model.)
- **Every mutation is a durable, ordered command** appended to a **write outbox**
  (an `actor`) with a client-generated UUID = idempotency key. The existing
  backend already honors `Idempotency-Key` (see Capabilities ledger) — we lean on
  it so retried commands land exactly once.
- **Reads hydrate from a cached snapshot + delta sync.** On launch and on
  reconnect, pull deltas since a server cursor; merge into the local store.

### Conflict resolution
- **POS/orders:** server-authoritative on money and stock; the outbox replays in
  order and surfaces a typed conflict (e.g. item 86'd while offline) to the
  operator as a native, resolvable prompt — never a silent drop.
- **Menu/settings (operator edits):** last-writer-wins per field with an audit
  trail, matching the web admin's current semantics.
- **[DECISION C] — persistence engine: SwiftData vs GRDB.** SwiftData is native,
  Observation-friendly, least code; GRDB is battle-tested, gives raw SQL,
  explicit migrations, and predictable performance at thousands of rows. My
  recommendation: **GRDB for the operator app** (POS needs deterministic
  performance + complex queries over thousands of orders/products) and **SwiftData
  for the customer app** (smaller dataset, faster to build). Documented trade-off,
  owner's call.

### Realtime
KDS and order boards subscribe to the **existing SSE streams** via a custom
`URLSession` bytes-stream reader wrapped as an `AsyncSequence<OrderEvent>`. SSE
(not WebSockets) because the streams already exist, it's one-directional
fan-out, and it survives proxies cleanly. Writes still go over normal HTTPS +
outbox; we don't need a bidirectional socket.

---

## 5. Networking & the typed contract

- **`APIClient` actor**: builds requests from a typed `Endpoint`, attaches auth,
  decodes the envelope, maps `error.code` → typed `APIError`, and applies retry
  with backoff + jitter on idempotent calls only.
- **Auth interceptor**: transparent access-token refresh on 401 (single-flight —
  concurrent 401s await one refresh), Keychain-backed.
- **Certificate pinning** for production hosts (pin the leaf/intermediate SPKI),
  with a documented rotation runbook so a cert change can't brick the fleet.
- **Codegen**: `Tooling/contract` reads the server Zod schemas → emits
  `CoreModels` Swift types + `Endpoint` stubs. The app never hand-writes a DTO.
  This is the firewall against client/server drift.

---

## 6. Design system (full spec in Stage 2 — `docs/native/DESIGN-SYSTEM.md`)

A native design system, not a port of the web CSS. Foundations:
- **Tokens**: semantic color (light/dark/high-contrast), a type ramp built on
  Dynamic Type (never fixed point sizes), an 8-pt spacing grid, elevation, and
  motion curves. Two brand skins: warm/red **Ottaviano**, dark/operator
  **OttavianoKDS** — mirroring the two PWA identities just shipped.
- **Components**: buttons, cards, sheets, the POS keypad, the KDS ticket, list
  rows, money/qty steppers — each a small reusable SwiftUI view with previews.
- **Motion & haptics**: spring-based, interruptible, purposeful;
  `sensoryFeedback` on commit actions. Respects Reduce Motion.
- **Accessibility is a gate, not a pass:** full VoiceOver labels, Dynamic Type to
  XXXL without truncation, 44pt targets, contrast ≥ WCAG AA. A screen ships only
  when it passes.

---

## 7. Navigation & interaction (native, per platform)

- **iPad operator:** `NavigationSplitView` (sidebar → list → detail/inspector),
  a `⌘K` command palette, full keyboard-shortcut map, drag-and-drop (assign
  order→table, drag tickets between KDS lanes), context menus, multi-select.
- **iPhone customer:** `TabView` + `NavigationStack`, bottom sheets for cart and
  item detail, `.searchable`, swipe actions, Live Activities for order tracking,
  App Intents/Siri for reorder, Apple Pay via `PayWithApplePayButton`.
- A typed **`AppRouter`** (enum `Route`) drives `NavigationStack` paths so deep
  links, state restoration, and cross-feature navigation are total and testable.

---

## 8. Security

Keychain for refresh tokens; biometric (`LocalAuthentication`) gate for the
operator app and for manager-override actions; **role-based permission checks
client-side for UX, enforced server-side for real** (reuse the existing RBAC).
Encrypted local store for any PII at rest. No secrets in the binary — all keys
are server-brokered. ATS on, pinning in prod, JWT refresh single-flighted.

---

## 9. Performance budgets (enforced, not aspirational)

| Metric | Budget |
|---|---|
| Cold launch to interactive | < 1.0s on iPhone 13-class |
| Scroll | 120 FPS on ProMotion, no dropped frames over a 2k-row list |
| POS "add item → reflected" | < 16ms (local write, no network on path) |
| Memory, 5k products + 2k live orders | < 250MB resident |
| KDS event → on-screen | < 250ms from SSE emit |

Lists are lazy + diffable; images are downsampled + cached; the local DB is
indexed for the POS hot paths. We profile with Instruments against a seeded
large-restaurant dataset before each feature is called done.

---

## 10. Testing strategy

- **Unit (Swift Testing):** stores, services, sync/conflict logic, the outbox —
  with injected fakes. The conflict engine gets adversarial property tests.
- **Snapshot:** design-system components + key screens, light/dark/Dynamic-Type.
- **UI (XCUITest):** the few critical flows — place order, take payment, bump a
  ticket, go offline→online and reconcile.
- **Contract tests:** generated models decode real recorded server responses;
  runs in web CI too so a backend change that breaks the app fails *server* CI.

---

## 11. Repo, CI & where this lives **[DECISION D]**

Options for the native code's home:
- **(rec) Separate repo** `ottaviano-ios`, with this repo declared the backend.
  Clean macOS CI (Xcode Cloud or GH macOS runners), independent release cadence,
  no web/native toolchain collision. The API contract is the seam between them.
- **Monorepo** `ios/` folder here: one PR can change server + client together
  (nice during the v1-facade phase), at the cost of a heavier, mixed CI.

Either way: the **`/api/v1` facade is built in this (web) repo** — that work is
verifiable here and unblocks the apps. My recommendation: facade now in this
repo; apps in a dedicated repo once the contract is signed off.

---

## 12. Staged roadmap (each stage has an exit criterion)

| # | Stage | Exit criterion |
|---|---|---|
| 1 | **Architecture spec** (this doc) | Owner signs off §13 decisions |
| 2 | **API v1 facade + auth/JWT** *(this repo, verifiable here)* | `/api/v1/auth/*` + 3 read endpoints live, envelope + contract codegen proven |
| 3 | **Design system** package + Storybook-style preview gallery | Token set + 10 core components, a11y-passing |
| 4 | **Navigation shell + infra** (both apps boot, DI, networking, persistence, sync skeleton) | Apps launch, authenticate, render a synced list offline |
| 5 | **Features**, vertical slices in priority order | each: audit→design→build→test→profile |
| 6 | **Hardening**: performance, offline edge cases, App Store readiness | budgets met, TestFlight build |

**Feature priority (Stage 5):** Operator first — **POS → KDS → Orders → Tables →
Inventory → Reporting → Staff/Settings** (this is the revenue-critical core),
then Customer — **Menu → Ordering/Pay → Loyalty/Wallet → Reservations →
Account**. Rationale: the operator app is what the business *runs on*; a great
customer app on a shaky operations core is worthless.

---

## 13. Open decisions (need owner sign-off before Stage 2)

- **[A] Backend strategy** — ✅ **CONFIRMED:** keep the Next.js/Postgres backend +
  versioned `/api/v1` facade; do **not** rewrite the server. **Added constraint:**
  the business is **leaving Vercel 100%** in future, so the facade + infra are
  built host-portable from day one (see §2.1).
- **[B] Contract source of truth** — *Open (Stage 2 call). Recommend:* generate
  OpenAPI from the existing Zod schemas, generate Swift models from that.
- **[C] Persistence engine** — *Open (Stage 4 call). Recommend:* GRDB (operator) +
  SwiftData (customer).
- **[D] Code location** — ✅ **CONFIRMED:** native apps in a dedicated
  **`ottaviano-ios`** repo; this repo stays the backend and hosts the `/api/v1`
  facade. The API contract is the seam between the two repos.
- **[E] iOS minimum version** — *Open. Recommend:* iOS 26 only (latest).

> **Sign-off (2026-06-26):** A and D confirmed as above. **Next:** author the
> **Stage 3 design-system** (`DESIGN-SYSTEM.md`) and **navigation/app-shell**
> (`APP-SHELL.md`) specs as durable source artifacts (owner's directive), ahead
> of writing the API facade code. B/C/E resolved when their stage begins.
