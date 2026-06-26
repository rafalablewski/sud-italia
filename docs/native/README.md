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

## Decisions (signed off 2026-06-26)
- **Backend:** keep it + add `/api/v1` facade. **Do not** rewrite the server.
  Build host-portable — **the business is leaving Vercel 100%** (ARCHITECTURE §2.1).
- **Code home:** native apps in a dedicated **`ottaviano-ios`** repo; this repo
  stays the backend and hosts the API facade.

## Status & next
- ✅ Stage 1 — architecture spec
- ✅ Stage 3a — design-system spec
- ✅ Stage 3b — app-shell / navigation spec
- ⏭️ **Stage 2** — build the `/api/v1` facade + JWT/Keychain auth + contract
  codegen **in this repo** (real, testable here). Then bootstrap `ottaviano-ios`
  (Stage 4 shell) on a Mac.

Open technical calls deferred to their stage: contract source (OpenAPI-from-Zod),
persistence engine (GRDB vs SwiftData), iOS minimum. Recommendations recorded in
`ARCHITECTURE.md` §13.
