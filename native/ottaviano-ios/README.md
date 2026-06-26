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
  AppInfra/        Router, Dependencies (DI), CustomerSession (phone-OTP auth state)
  Features/
    Menu/          MenuStore, MenuView                    customer menu (GET /menu)
    Auth/          AuthView                                phone → code sign-in
    Rewards/       LoyaltyCardView                         the loyalty card (GET /customer/me)
    Orders/        OrdersStore, OrdersListView, OrderTrackerView   history + live SSE tracker
    KDS/           KDSStore, KDSBoardView                  operator live board (SSE) + bump
Apps/
  Ottaviano/       OttavianoApp        customer @main, auth-gated TabView (Menu/Rewards/Orders)
  OttavianoKDS/    OttavianoKDSApp     operator @main, SplitView (Orders board + live KDS)
```

This meets the Stage-4 exit criterion and then some: both apps boot, theme,
**authenticate** (phone OTP), and render lists that hydrate from the API; the
customer **tracks an order live** and the operator **bumps tickets on a live SSE
board** — exercising auth, both SSE streams, and the bump mutation against the
real `/api/v1`. Still to come: cart + checkout + Stripe PaymentSheet (the client
calls are wired: `createOrder` + `paymentIntent` endpoints), offline persistence
(GRDB/SwiftData), and remaining operator surfaces (POS, tables, admin).

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
iOS 26+, Swift 6 (strict concurrency). iPhone-first customer app, iPad-first
operator app; both universal.
