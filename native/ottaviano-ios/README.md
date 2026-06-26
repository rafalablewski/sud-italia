# ottaviano-ios — native app seed

> **Authored, not compiled here.** This is the Stage-4 starting point for the two
> SwiftUI apps. It lives under `native/` in the backend repo as a **seed** — the
> plan (ARCHITECTURE §13 Decision D) is to **extract it to its own
> `ottaviano-ios` repo** and build it in Xcode on a Mac. The web dev container
> can't compile SwiftUI, so treat these files as reviewable source, not a green
> build. They are written to match `docs/native/ARCHITECTURE.md`,
> `DESIGN-SYSTEM.md`, and `APP-SHELL.md`.

## What's here (the spine + one vertical slice)
```
Package.swift                     SwiftPM graph (OttavianoKit umbrella + Features)
Sources/
  CoreModels/      Models.swift   wire DTOs (today hand-written; see Codegen below)
  Networking/      Envelope, APIError, TokenStore, APIClient, SSEClient
  DesignSystem/    Theme.swift    tokens + theming + DSButton + MoneyText
  AppInfra/        Router.swift   typed Route + Router; Dependencies.swift (DI)
  Features/Menu/   MenuStore.swift, MenuView.swift   (customer vertical slice)
Apps/
  Ottaviano/       OttavianoApp.swift       customer @main + TabView shell
  OttavianoKDS/    OttavianoKDSApp.swift     operator @main + SplitView shell
```

This satisfies the Stage-4 exit criterion in spirit: the apps boot, theme,
authenticate, and render a list that hydrates from the API — with DI + a typed
router. Offline persistence (GRDB/SwiftData) and the remaining features land next.

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
