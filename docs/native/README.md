# Ottaviano Native Platform — spec set

The staged rewrite of the customer + operator experience into two native apps,
keeping this repo's backend as a versioned, **host-portable** API (the business is
leaving Vercel — designed for from day one).

> **⚠️ Stack change (2026-06-30): SwiftUI retired → bare React Native.** The two
> apps are now built in **bare React Native 0.79.5 (no Expo, no EAS)**, living in
> this repo at **[`native/ottaviano-rn`](../../native/ottaviano-rn)** — one
> TypeScript codebase, shared with the web, built with the team's own Xcode
> pipeline (**XcodeGen + CocoaPods + xcodebuild**), shipped via **GitHub Actions**
> or **Xcode Cloud**. The SwiftUI seed (`native/ottaviano-ios`) has been
> **deleted**. The rendering decision is **100% native — no WebView** (see
> [`IOS-WEB-MIRROR.md`](./IOS-WEB-MIRROR.md)). The specs below stay valid where
> they describe the **backend + the API contract + the IA/design intent** (which
> the RN apps mirror 1:1); the **Swift-specific** parts (SwiftPM graph in
> `APP-SHELL.md`, Swift codegen, `@Observable`/SwiftData, the `ottaviano-ios`
> extraction decision) are **superseded** by `native/ottaviano-rn/README.md`. The
> `/api/v1` facade, the design tokens, and the operator IA are unchanged — they
> are still generated from the web source and now feed the RN app (the native
> parity gate, `npm run check:native`, repointed at `native/ottaviano-rn`).

## Documents
| Doc | Stage | What it locks down |
|---|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 1 | System topology, backend-as-API (`/api/v1` facade), Vercel-exit portability, app architecture, offline-first sync, security, performance budgets, roadmap, **signed-off decisions** |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | 3a | Tokens (color/type/space/motion), theming, component catalog, accessibility gates |
| [`APP-SHELL.md`](./APP-SHELL.md) | 3b | Per-platform shells, navigation/Router, launch sequence, feature-module contract. ⚠️ *Swift/SwiftPM mechanics superseded by the bare-RN app — read for IA/shell intent.* |
| [`API-V1.md`](./API-V1.md) | 2 | The `/api/v1` facade: envelope, auth/token lifecycle, endpoints, OpenAPI/codegen, host-portability |
| [`VERCEL-EXIT.md`](./VERCEL-EXIT.md) | infra | Host-migration cutover plan — portable runtime, cron/CDN/storage swaps, zero-downtime sequence |
| [`IOS-WEB-MIRROR.md`](./IOS-WEB-MIRROR.md) | decision | Web 1:1 mirroring — **DECIDED: 100% native, no WebView.** Options compared; how native parity is held (token/IA codegen + parity ledger); the accepted maintenance cost; hardware/offline/responsive |

## Decisions (signed off 2026-06-26)
- **Backend:** keep it + add `/api/v1` facade. **Do not** rewrite the server.
  Build host-portable — **the business is leaving Vercel 100%** (ARCHITECTURE §2.1).
- **Code home:** the RN apps currently live **in-repo** at
  [`native/ottaviano-rn`](../../native/ottaviano-rn); this repo stays the backend
  and hosts the API facade. *(The SwiftUI-era plan for a dedicated `ottaviano-ios`
  repo — ARCHITECTURE §13 D — was not carried forward; revisit only if CI cost
  demands a split.)*

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
- 🟡 **Stage 4 — web-layout parity in progress:** the bare-RN app lives at
  [`native/ottaviano-rn`](../../native/ottaviano-rn) — one TS codebase, two Xcode
  targets (`Ottaviano` customer, `OttavianoKDS` operator) from one JS bundle, with
  the API client (envelope + bearer + rotating refresh), the SSE reader, the
  generated skins (`theme/tokens.generated.ts`) and operator IA
  (`nav/operatorNav.generated.ts`). Both apps mirror the **web information
  architecture**:
  - **Ottaviano (customer)** — `Order · Rewards · Orders · More` tabs (React
    Navigation), with the full order path (browse → add-to-cart → location switch →
    guest/customer checkout via server-priced `POST /orders` → confirmation → live
    SSE tracking).
  - **OttavianoKDS (operator)** — a slide-in drawer (`OperatorShell`) that is a 1:1
    mirror of the web admin rail (`src/admin-v3/nav.config.ts`) plus the Core
    surfaces, **role-filtered** by the signed-in staff rank exactly like
    `filterNavForRoleV3` (owner → all, franchisee → scope, kitchen → line).
    See [`src/nav/operatorNav.ts`](../../native/ottaviano-rn/src/nav/operatorNav.ts).
  Live today: the whole customer path, and the operator Dashboard, Orders board,
  KDS, plus the breadth of admin surfaces — each off a bearer-authed, role-gated
  `/api/v1/admin/*` endpoint (`src/app/api/v1/admin/`), rendered either as a
  **bespoke faithful screen** (KDS, Orders, Dashboard, **Inventory**) or via the
  generic live `DataSurface`. Remaining surfaces upgrade from generic list →
  bespoke screen wave by wave; the two content pages (SOC 2, Capabilities) stay
  honest scaffolds (never fake data — Rule #1).
  **Authored, not compiled here** (the web container has no iOS toolchain) — built
  in Xcode on a Mac / macOS CI, with the four-step XcodeGen→Pods→build pipeline in
  the [app README](../../native/ottaviano-rn/README.md).

Open technical calls deferred to their stage: contract source (OpenAPI-from-Zod),
on-device persistence/offline store (the RN choice — e.g. SQLite via
`op-sqlite`/WatermelonDB vs MMKV — supersedes the SwiftUI-era GRDB/SwiftData
question), iOS minimum. Earlier (Swift-era) recommendations are recorded in
`ARCHITECTURE.md` §13 and read as design intent, not current stack.
