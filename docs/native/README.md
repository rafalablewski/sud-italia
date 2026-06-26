# Ottaviano Native Platform — spec set

The staged rewrite of the customer + operator experience into two native SwiftUI
apps, keeping this repo's backend as a versioned, **host-portable** API (the
business is leaving Vercel — designed for from day one).

> **Why specs, not Swift, in this repo:** SwiftUI/iOS can't compile or run in the
> web dev container (Linux). These documents are the durable, reviewable
> artifacts; the Swift apps live in the dedicated **`ottaviano-ios`** repo and are
> built in Xcode on a Mac. See `ARCHITECTURE.md` §0.

## Documents
| Doc | Stage | What it locks down |
|---|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 1 | System topology, backend-as-API (`/api/v1` facade), Vercel-exit portability, app architecture, offline-first sync, security, performance budgets, roadmap, **signed-off decisions** |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | 3a | Tokens (color/type/space/motion), theming, component catalog, accessibility gates |
| [`APP-SHELL.md`](./APP-SHELL.md) | 3b | SwiftPM package graph, DI, typed Router, per-platform shells, launch sequence, feature-module contract |
| [`API-V1.md`](./API-V1.md) | 2 | The `/api/v1` facade: envelope, auth/token lifecycle, endpoints, OpenAPI/codegen, host-portability |
| [`VERCEL-EXIT.md`](./VERCEL-EXIT.md) | infra | Host-migration cutover plan — portable runtime, cron/CDN/storage swaps, zero-downtime sequence |

## Decisions (signed off 2026-06-26)
- **Backend:** keep it + add `/api/v1` facade. **Do not** rewrite the server.
  Build host-portable — **the business is leaving Vercel 100%** (ARCHITECTURE §2.1).
- **Code home:** native apps in a dedicated **`ottaviano-ios`** repo; this repo
  stays the backend and hosts the API facade.

## Status & next
- ✅ Stage 1 — architecture spec
- ✅ Stage 3a — design-system spec
- ✅ Stage 3b — app-shell / navigation spec
- 🟡 **Stage 2 — in progress (this repo, verifiable here):** the `/api/v1`
  facade is live — single envelope, JWT access + rotating refresh auth,
  `auth/{login,refresh,logout,me}`, public `locations` + `menu`, and an OpenAPI
  3.1 contract at `/api/v1/openapi.json` **generated from the server Zod
  schemas** (DECISION B ✅ — one definition drives validation, the TS response
  types, and the contract), plus the operator order spine + live SSE board. See
  [`API-V1.md`](./API-V1.md). Committed codegen artifact: `docs/native/openapi.json`
  (`npm run gen:openapi`), the operator order spine + SSE, **customer phone-OTP
  auth + server-priced order create** (guest or customer, idempotent), and the
  `VERCEL-EXIT.md` cutover plan, and **customer order history + live tracking**
  (ownership-gated, SSE — operator bump → customer tracker in real time).
  Remaining Stage 2: payment (Stripe/Apple Pay) on order create.
- ⏭️ **Stage 4** — bootstrap `ottaviano-ios` (the app shell) on a Mac once the
  contract coverage is sufficient.

Open technical calls deferred to their stage: contract source (OpenAPI-from-Zod),
persistence engine (GRDB vs SwiftData), iOS minimum. Recommendations recorded in
`ARCHITECTURE.md` §13.
