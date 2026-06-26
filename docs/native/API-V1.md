# Ottaviano `/api/v1` — the native facade

> **Stage 2.** The versioned, host-portable API the two native apps consume.
> Lives in **this** repo (the backend); the apps in `ottaviano-ios` depend only
> on this contract. Verifiable here (route handlers + unit tests). Companion to
> `ARCHITECTURE.md` (§2, §2.1, §5).

## Why a facade
The existing 238 routes were shaped for a coupled React client. A shipped native
binary can't tolerate silent shape changes or cookie-implicit auth. `/api/v1` is
a thin, **additive-only** boundary with one envelope, token auth, and a published
contract — the firewall behind which the backend can even **leave Vercel**
without an App Store release (§2.1).

## Response envelope
Every endpoint returns exactly one shape (`src/lib/api/v1/envelope.ts`):
```jsonc
// success
{ "data": <T>, "meta"?: { "nextCursor"?: "...", "deprecation"?: "...", ... } }
// failure
{ "error": { "code": "unauthorized", "message": "human text", "details"?: <any> } }
```
- `code` ∈ `bad_request | unauthorized | forbidden | not_found | conflict |
  rate_limited | validation_failed | internal` — apps branch on **code**, never
  the message.
- HTTP status is derived from the code. `X-Ottaviano-API: v1` on every response.

## Auth — JWT access + rotating refresh
Reuses the existing admin-user / RBAC model — **no parallel identity system**.

| Token | Form | TTL | Storage |
|---|---|---|---|
| Access | HS256 JWT (`src/lib/api/v1/jwt.ts`) | 15 min | app memory |
| Refresh | opaque `<id>.<secret>`, server-stored | 30 days | device **Keychain** |

- **Login** (`POST /auth/login`) mirrors the web login exactly: shared-owner
  password, or email-bound user with per-user scrypt password + optional TOTP.
  Returns `{ accessToken, refreshToken, expiresIn, user }`.
- **Refresh** (`POST /auth/refresh`) **rotates** on every use. Replaying a spent
  token trips reuse detection and **revokes the whole family** (theft
  containment). Refresh re-resolves the *live* user, so a re-scope/disable lands
  within one access-token lifetime.
- **Logout** (`POST /auth/logout`) revokes the refresh token; idempotent.
- **Me** (`GET /auth/me`, Bearer) returns the current operator.

Refresh records persist via the standard store (`addApiRefreshToken` &c. in
`store.ts`) — Postgres in prod, filesystem in dev — storing only a **SHA-256** of
the secret. Signing secret: `API_JWT_SECRET` → falls back to
`SESSION_SECRET`/`ADMIN_PASSWORD` so demo works with zero config.

> Scope today: the facade authenticates **operators** (OttavianoKDS). Customer
> identity stays phone-based (a later stage adds `/auth` for the customer app).

## Endpoints (live)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/login` | none | 5/min/IP; `{ email?, password, totp?, app? }` |
| POST | `/api/v1/auth/refresh` | none | rotates; reuse-detecting |
| POST | `/api/v1/auth/logout` | none | revokes refresh token |
| GET | `/api/v1/auth/me` | Bearer | current operator |
| POST | `/api/v1/customer/auth/request` | none | send phone OTP (3/min/phone); `devCode` only in non-prod w/o SMS |
| POST | `/api/v1/customer/auth/verify` | none | code → **customer** token pair (aud `ottaviano`); single-use, attempt-capped |
| GET | `/api/v1/customer/me` | Bearer (customer) | profile + loyalty points/tier |
| GET | `/api/v1/customer/orders` | Bearer (customer) | the customer's own orders (history + active) |
| GET | `/api/v1/customer/orders/:id` | Bearer (customer) | one own order (ownership-gated; 404 if not theirs) |
| GET | `/api/v1/customer/orders/:id/stream` | Bearer (customer) | **SSE** live tracker — `data: { order }` |
| POST | `/api/v1/orders` | optional (customer) | **create order** — guest or customer; server-priced; idempotent |
| POST | `/api/v1/orders/:id/payment-intent` | optional (customer) | **Stripe PaymentIntent** (Apple Pay/cards); server-priced; idempotent per order |
| GET | `/api/v1/locations` | none | active locations (curated DTO) |
| GET | `/api/v1/menu?location=<slug>` | none | menu; prices in **grosze** |
| GET | `/api/v1/orders` | Bearer | operator board, newest-first, scope-filtered, capped |
| GET | `/api/v1/orders/:id` | Bearer | order detail (scope-checked) |
| PATCH | `/api/v1/orders/:id` | Bearer | status bump (KDS); **idempotent** (no-op at target) |
| GET | `/api/v1/orders/stream` | Bearer | **SSE** live board — `data: { orders }` frames |
| GET | `/api/v1/openapi.json` | none | the contract document |

### Customer auth (phone OTP) + order create
The Ottaviano app logs in with a **phone code** — zero-friction, no passwords
(Rule #6). `request` sends a 6-digit code (hashed at rest, 5-min TTL,
attempt-capped) via the configured SMS provider; with no provider, in non-prod,
the code is returned as `devCode` so the flow is testable. `verify` exchanges it
for a **customer** token pair (aud `ottaviano`, subject = phone), reusing the
same JWT + rotating-refresh infra as operators (the refresh route branches the
identity resolver on `aud`). `customer/me` returns the loyalty profile.

**`POST /api/v1/orders`** creates an order — for a logged-in customer (phone from
the token) **or a guest** (name + phone in the body). It is **never** trusted to
price itself: it delegates to the shared `createOrderFromCart`, which looks up
the live menu, applies bundle/combo math + delivery fee, claims slot capacity,
and enforces min-order/availability — the exact path the web checkout uses.
An `Idempotency-Key` header makes retries safe (a repeat with the same key + body
returns the original order, `meta.idempotent=true`). Orders are created unpaid;
payment (Stripe / Apple Pay) layers on later.

**Order history + tracking.** `customer/orders` lists the customer's own orders
(by token phone, newest-first, pending included so a just-placed order shows).
`customer/orders/:id` returns one — **ownership-gated**: a non-owned or missing
id is a uniform **404** (never 403, so ids can't be probed). `…/:id/stream` is
the **live tracker** (the order-tracker / Live Activity feed, APP-SHELL §5.2):
Bearer-header SSE, ownership-checked, emitting `{ order }` on every status change.
The operator's KDS bump (`PATCH /orders/:id`) propagates to the customer's
tracker through the same in-process emitter — verified end-to-end.

### Payment (Stripe PaymentIntent + Apple Pay)
`POST /orders/:id/payment-intent` creates a Stripe **PaymentIntent** for the
order's **server-authoritative total** (`order.totalAmount` grosze — the client
never names the amount) and returns `{ clientSecret, publishableKey, amount,
currency }`. The native app drives the **Stripe iOS PaymentSheet** with the
client secret — which renders **Apple Pay** + cards natively (Apple Pay is a
client config: the app's merchant id; no extra server surface). `automatic_
payment_methods` lets every method enabled in the Stripe dashboard appear.
Creation is **idempotent per order** (`idempotencyKey: v1-pi-<orderId>`) so a
retry never double-charges. Ownership: a customer token must own the order; else
the hard-to-guess order id is the gate (web-checkout model). When Stripe isn't
configured the route returns **503** (capabilities: needs-config).

Settlement is the webhook: **`payment_intent.succeeded`** → `updateOrder(status:
confirmed, paidAt, stripePaymentIntentId)`, guarded on not-already-paid so a
Checkout payment (which emits both `checkout.session.completed` and the intent
event) can't double-run referral qualification. Env: `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

Verified up to the Stripe boundary (can't cross without real keys): 503
unconfigured · 404 unknown · 409 already-paid · a fresh unpaid order reaches
`paymentIntents.create`.

### Operator order spine
`orders*` are the OttavianoKDS revenue path, reusing the live domain
(`getOrders`/`getOrderById`/`updateOrderStatus`) — **no pricing reimplemented**.
Every call is **location-scoped** against the token's scope (`guard.ts`,
the native analogue of `requireLocationAccess`): a Kraków-scoped operator can't
read or bump a Warszawa order. The stream is the realtime spine (ARCHITECTURE
§4): the app opens it with a Bearer header (URLSession can; `EventSource`
can't — fine for a native client) and consumes `{ orders: Order[] }` frames as
an `AsyncSequence`, backed by the same in-process emitter + 10s backstop + 25s
ping as the web admin board. Status bumps are idempotent so an offline-replayed
or double-tapped bump can't error.

Money is always **minor units (grosze)** on the wire; the app formats via
`MoneyText` (DESIGN-SYSTEM §4.2). Operator-internal fields (cost, packaging, sku)
are never exposed on customer endpoints.

## Contract & codegen — generated from Zod (DECISION B ✅)
The contract is **one definition, three consumers**: the Zod schemas in
`src/lib/api/v1/schemas.ts` drive (1) **runtime request validation**, (2) the
**TypeScript response types** (`z.infer` — the DTO mappers return these, so a
drifting response fails to compile), and (3) the **OpenAPI 3.1 document**
(`openapi.ts` via `z.toJSONSchema` over a `z.registry()`, emitting shared
`#/components/schemas/*` `$ref`s). The wire shape therefore cannot drift from the
validator, the server types, or the published contract.

- `GET /api/v1/openapi.json` serves the generated document live.
- `npm run gen:openapi` writes the committed copy `docs/native/openapi.json` —
  the input for the iOS repo's `swift-openapi-generator` (→ the Swift
  `CoreModels` package) and a reviewable diff when the contract changes.
- `tests/api-v1-openapi.test.ts` guards it: every `$ref` resolves, all expected
  operations exist, the mapper output round-trips through the schema, and the
  committed artifact is in sync (CI fails if you forget `gen:openapi`).

**Swift side (in `ottaviano-ios`):** add a `swift-openapi-generator` build
plugin pointed at `openapi.json` → `CoreModels` is generated at build time; no
hand-written DTOs (APP-SHELL §1).

## Host portability (Vercel exit)
- Server URL is **relative** (`/api/v1`) — no hostname baked into the contract.
- No Vercel-only primitive on the request path (no Edge Middleware / KV / Blob).
- `API_JWT_SECRET` is a plain env var, not a Vercel secret store.
- The app reads its origin from signed remote config + a baked fallback and pins
  to an SPKI we control, so the origin can move with no client release (§2.1).

## Tests
`tests/api-v1-jwt.test.ts` locks the access-token sign/verify round-trip, tamper
rejection, expiry, and type checks. Run: `npx tsx --test tests/api-v1-jwt.test.ts`.

## Remaining in Stage 2
- ✅ **Payment** — Stripe PaymentIntent (`/orders/:id/payment-intent`) + the
  `payment_intent.succeeded` webhook marking `paidAt`. Apple Pay via PaymentSheet.
- ✅ Customer **order history + live tracking** — `customer/orders[/:id[/stream]]`.
- ✅ `docs/native/VERCEL-EXIT.md` — the host-migration cutover checklist.
