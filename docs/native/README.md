# Ottaviano Native Platform — spec set

The staged rewrite of the customer + operator experience into two native apps,
keeping this repo's backend as a versioned, **host-portable** API (the business is
leaving Vercel — designed for from day one).

> **⚠️ Stack change (2026-06-30): SwiftUI retired → React Native (Expo).** The two
> apps are now built in **React Native + Expo + expo-router**, living in this repo
> at **[`native/ottaviano-rn`](../../native/ottaviano-rn)** — one TypeScript
> codebase, shared with the web, buildable via **GitHub Actions (EAS)** or
> **Xcode**. The SwiftUI seed (`native/ottaviano-ios`) has been **deleted**. The
> specs below stay valid where they describe the **backend + the API contract +
> the IA/design intent** (which the RN apps mirror 1:1); the **Swift-specific**
> parts (SwiftPM graph in `APP-SHELL.md`, Swift codegen, the `ottaviano-ios`
> extraction decision) are superseded by `native/ottaviano-rn/README.md`. The
> `/api/v1` facade, the design tokens, and the operator IA are unchanged — they
> are still generated from the web source and now feed the RN app (the native
> parity gate, `npm run check:native`, repointed at `native/ottaviano-rn`).

## Documents
| Doc | Stage | What it locks down |
|---|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 1 | System topology, backend-as-API (`/api/v1` facade), Vercel-exit portability, app architecture, offline-first sync, security, performance budgets, roadmap, **signed-off decisions** |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | 3a | Tokens (color/type/space/motion), theming, component catalog, accessibility gates |
| [`APP-SHELL.md`](./APP-SHELL.md) | 3b | SwiftPM package graph, DI, typed Router, per-platform shells, launch sequence, feature-module contract |
| [`API-V1.md`](./API-V1.md) | 2 | The `/api/v1` facade: envelope, auth/token lifecycle, endpoints, OpenAPI/codegen, host-portability |
| [`VERCEL-EXIT.md`](./VERCEL-EXIT.md) | infra | Host-migration cutover plan — portable runtime, cron/CDN/storage swaps, zero-downtime sequence |
| [`IOS-WEB-MIRROR.md`](./IOS-WEB-MIRROR.md) | proposal | Web 1:1 mirroring: all-native vs. **embedded-WebView hybrid** trade-off, the per-surface routing rule, JS⇄native bridge, hardware/offline/theming sync, pitfalls — **[DECISION] open** |

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
  (ownership-gated, SSE — operator bump → customer tracker in real time), and
  **Stripe PaymentIntent + Apple Pay** payment (`/orders/:id/payment-intent` +
  the `payment_intent.succeeded` webhook). **Stage 2 backend is contract-complete.**
- 🟡 **Stage 4 — web-layout parity in progress:** the SwiftUI app seed lives at
  [`native/ottaviano-ios/`](../../native/ottaviano-ios/) — SwiftPM spine
  (CoreModels, Networking with APIClient/TokenStore/SSE, DesignSystem, AppInfra
  Router+DI), and both apps now mirror the **web information architecture**:
  - **Ottaviano (customer)** — TabView `Order · Rewards · Orders · More`, with the
    full order path (browse → add-to-cart → location switch → guest/customer
    checkout via server-priced `POST /orders` → confirmation → live SSE tracking).
  - **OttavianoKDS (operator)** — NavigationSplitView whose sidebar is a 1:1 Swift
    mirror of the web admin rail (`src/admin-v3/nav.config.ts`) plus the Core
    surfaces (`CoreNav.tsx`), **role-filtered** by the signed-in staff rank exactly
    like `filterNavForRoleV3` (owner → all, franchisee → scope, kitchen → line).
    See [`Sources/AppInfra/OperatorNav.swift`](../../native/ottaviano-ios/Sources/AppInfra/OperatorNav.swift).
  Live today: the whole customer path, and the operator Dashboard, Orders board,
  KDS, **Reports, Customers, Staff, Suppliers, Feedback, Inventory, Purchase
  orders and Service/slots** — each off a new bearer-authed, role-gated
  `/api/v1/admin/*` endpoint (`src/app/api/v1/admin/`). Remaining surfaces are
  parity scaffolds (purpose + role + honest wiring status, never fake data —
  Rule #1) going live wave by wave as the facade expands.
  **Authored, not compiled here** (no SwiftUI toolchain in the web container) —
  extract to the dedicated `ottaviano-ios` repo and build in Xcode on a Mac, with
  `swift-openapi-generator` pointed at `openapi.json` to replace the hand-written
  models. See that folder's README.

Open technical calls deferred to their stage: contract source (OpenAPI-from-Zod),
persistence engine (GRDB vs SwiftData), iOS minimum. Recommendations recorded in
`ARCHITECTURE.md` §13.
