# ottaviano-ios — native app seed

> **Authored, not compiled here.** This is the Stage-4 starting point for the two
> SwiftUI apps. It lives under `native/` in the backend repo as a **seed** — the
> plan (ARCHITECTURE §13 Decision D) is to **extract it to its own
> `ottaviano-ios` repo** and build it in Xcode on a Mac. The web dev container
> can't compile SwiftUI, so treat these files as reviewable source, not a green
> build. They are written to match `docs/native/ARCHITECTURE.md`,
> `DESIGN-SYSTEM.md`, and `APP-SHELL.md`.

## What's here (the spine + working feature slices)
```
Package.swift                     SwiftPM graph (OttavianoKit umbrella + AppFeatures)
Sources/
  CoreModels/      Models, AuthModels   wire DTOs (hand-written; see Codegen below)
  Networking/      Envelope, APIError, TokenStore, APIClient (+endpoint catalogue), SSEClient
  DesignSystem/    Theme                tokens + theming + DSButton + MoneyText
  AppInfra/        Router, Dependencies (DI), CustomerSession, OperatorSession,
                   OperatorNav        the operator IA — 1:1 mirror of the web admin
                                      nav.config.ts + Core surfaces, role-ranked
  Features/
    Menu/          MenuStore, MenuView                    customer storefront + add-to-cart
    Cart/          CartStore, CartView                    cart → checkout → confirmation (guest-capable)
    Locations/     LocationPickerView (+ LocationsStore)  switch restaurant (GET /locations)
    Account/       AccountView                            "More": famiglia / soci / locations / account
    Auth/          AuthView, SignInGate                   phone → code sign-in (zero-friction)
    Rewards/       LoyaltyCardView                         the loyalty card (GET /customer/me)
    Orders/        OrdersStore, OrdersListView, OrderTrackerView   history + live SSE tracker
    KDS/           KDSStore, KDSBoardView                  operator live board (SSE) + bump
    Operator/      OperatorBoardView, OperatorDashboardView,
                   OperatorLoginView, OperatorSurfaceView  the admin+core shell surfaces
Apps/
  Ottaviano/       OttavianoApp     customer @main, TabView: Order · Rewards · Orders · More
  OttavianoKDS/    OttavianoKDSApp  operator @main, SplitView whose sidebar is the FULL
                                    web operator IA (Core + every /admin section), role-filtered
```

**Web-layout parity** is the goal: the apps mirror the web IA exactly. The
customer app reproduces the storefront's tabs and the full order path
(browse → add to cart → guest/customer checkout via `POST /orders`, server-priced
→ confirmation → live tracking). The operator app's sidebar reproduces the web
admin rail section-for-section (`src/admin-v3/nav.config.ts`) plus the Core
surfaces (`CoreNav.tsx`), gated by the signed-in staff member's role rank exactly
like `filterNavForRoleV3` — owner sees all, a franchise manager their scope, a
chef the line. Surfaces backed by `/api/v1` today (**Dashboard, Orders board,
KDS lanes**, plus the whole customer path) render **live data**; the remaining
admin surfaces render a parity scaffold that states purpose + role + wiring
status (never fake data — Rule #1) and go live as the `/api/v1` facade is
extended to cover them. Still to come: Stripe PaymentSheet (the `paymentIntent`
endpoint is wired; the SDK is added in the extracted repo), offline persistence
(GRDB/SwiftData), and `/api/v1` coverage for the admin data surfaces.

## Codegen — replace CoreModels with generated types
`CoreModels/Models.swift` is a hand-written stand-in so the sample is
self-contained. The real models come from the **committed OpenAPI contract**
(`../../docs/native/openapi.json`, generated from the server Zod schemas via
`npm run gen:openapi`). In the extracted repo, add Apple's
[`swift-openapi-generator`](https://github.com/apple/swift-openapi-generator) as
a build-tool plugin pointed at that file and delete the hand-written models — the
wire types then track the server automatically (ARCHITECTURE §5).

## Build (in the extracted repo, on a Mac)
1. `xcodegen`/Xcode: create two app targets (Ottaviano, OttavianoKDS) that depend
   on the `OttavianoKit` + `Features` SwiftPM package here.
2. Set `OTTAVIANO_API_BASE_URL` (e.g. `https://api.ottaviano.pl/api/v1`) — the
   only host reference, so the Vercel exit needs no code change (§2.1).
3. Add the Stripe iOS SDK to the customer app for PaymentSheet (Apple Pay).
4. Build & run on an iPhone (Ottaviano) / iPad (OttavianoKDS) simulator.

## Targets
iOS 18+ deployment (built with the latest SDK), Swift 6 (strict concurrency). iPhone-first customer app, iPad-first
operator app; both universal.
