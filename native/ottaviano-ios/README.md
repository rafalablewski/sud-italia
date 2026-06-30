# ottaviano-ios — the OttavianoKDS SwiftUI app

> **SwiftUI is the native stack.** "We build only SwiftUI" — so the operator
> console is a native SwiftUI app, not a WebView and not React Native. This tree
> was restored from the previously-retired SwiftUI seed and re-pointed at the
> **current** web theme: the two app skins' palettes are **generated** from the
> live token CSS (`gen-native-tokens.ts`), so the operator skin tracks the web
> Core (BRACE) theme and can't drift.
>
> **Scope: OttavianoKDS (operator) only.** The customer app target was retired
> (owner directive) — the shared `OttavianoKit` spine + the `Operator`/`KDS`
> feature modules are the whole product here.

> **Authored, not compiled here.** The web dev container can't compile SwiftUI,
> so treat these files as reviewable source — CI (`.github/workflows/ios-swift.yml`)
> does the simulator build on a macOS runner. They are written to match
> `docs/native/ARCHITECTURE.md`, `DESIGN-SYSTEM.md`, and `APP-SHELL.md`.

## What's here (the operator spine + every surface)
```
Package.swift                     SwiftPM graph (OttavianoKit umbrella + AppFeatures)
Sources/
  CoreModels/      Models, AuthModels, AdminModels, KDS/Floor/GuestHub models  wire DTOs
  Networking/      Envelope, APIError, TokenStore, APIClient (+endpoint catalogue), SSEClient
  DesignSystem/    Theme            theming + DSButton + MoneyText + KDS ticket + POS keypad
                   Tokens.generated ⚙︎ the skins' palettes — GENERATED from the web
                                    token CSS (gen-native-tokens.ts), provenance per line
  AppInfra/        Router, Dependencies (DI), OperatorSession,
                   OperatorNav      types + role enum + filteredNav(for:)
                   OperatorNav.generated ⚙︎ OPERATOR_NAV — generated 1:1 from the web
                                    admin nav.config.ts + Core surfaces (gen-native-nav.ts)
  Features/
    KDS/           KDSStore, KDSBoardView, KDSFleetView, EightySixSheet, KDSChime
                                    operator live board (SSE) + bump/recall/86 + all-day
    Operator/      Dashboard · Orders board · Floor · POS · Reports · Customers · Staff ·
                   Suppliers · Inventory · Purchase orders · Menu · Recipes · Guest hub ·
                   Calculator · Ops Agent · Agent HQ · Settings + ~40 more — the FULL IA
Apps/
  OttavianoKDS/    OttavianoKDSApp  operator @main, NavigationSplitView whose sidebar is the
                                    FULL web operator IA (Core + every /admin section),
                                    role-filtered exactly like the web admin rail
```

**Web-layout parity** is the goal: the app mirrors the web IA exactly. The
operator sidebar reproduces the web admin rail section-for-section
(`src/admin-v3/nav.config.ts`) plus the Core surfaces (`src/core/routes.ts`),
gated by the signed-in staff member's role rank exactly like `filterNavForRoleV3`
— owner sees all, a franchise manager their scope, a chef the line. The
**Kitchen Display** reproduces `src/core/kds/CoreKds.tsx`: live SSE lanes
(Floor/Chef/Fleet), tone tiers + SLA meter + due countdown, bump (`PATCH
/orders/:id`), recall, 86 (`PATCH /admin/menu`), all-day, station filter.

**52 of 54 operator surfaces are live** on real `/api/v1/admin/*` data — the
honest data-backed maximum (see `docs/native/parity/PARITY-LEDGER.md`, generated).
The **only** 2 not mirrored are **SOC 2 controls** and **Capabilities**: both are
hardcoded TSX content pages with no store/data source, so mirroring them in Swift
would duplicate the Rule #9 source of truth and drift — they remain honest parity
scaffolds by design. Also pending: offline persistence (GRDB/SwiftData).

## Colours come from the web theme (generated, drift-gated)
The skin palettes are **not** hand-transcribed — `scripts/gen-native-tokens.ts`
reads `src/app/themes/core/tokens.css` (operator, dark) and emits
`Sources/DesignSystem/Tokens.generated.swift` with per-line provenance, so a web
re-skin propagates and CI fails on divergence. The operator IA is generated the
same way (`gen-native-nav.ts` → `Sources/AppInfra/OperatorNav.generated.swift`).
Run from the **backend repo root**: `npm run gen:native` (regenerate) /
`npm run check:native` (CI drift gate).

## App Store submission readiness
OttavianoKDS is an internal staff tool — Apple typically routes those to **Apple
Business Manager (custom/unlisted app)**, not the public App Store (4.2/4.3), and
a public submission needs a **working demo login** in the review notes. A
**`PrivacyInfo.xcprivacy`** ships with the app (truthful: no tracking, no
required-reason APIs — Keychain + URLSession only). **Still required before a real
submission** (can't be done from this Linux container — they need Xcode/a Mac):
the app must actually **compile + run** (this tree is a reviewable SwiftPM source,
not a green build), plus App Store Connect metadata (privacy nutrition label,
screenshots, support/marketing URLs).

## Codegen — replace CoreModels with generated types
`CoreModels/Models.swift` is a hand-written stand-in so the sample is
self-contained. The real models come from the **committed OpenAPI contract**
(`../../docs/native/openapi.json`, generated from the server Zod schemas via
`npm run gen:openapi`). In the extracted repo, add Apple's
[`swift-openapi-generator`](https://github.com/apple/swift-openapi-generator) as
a build-tool plugin pointed at that file and delete the hand-written models — the
wire types then track the server automatically (ARCHITECTURE §5).

## Build (on a Mac / in CI)
1. `cd native/ottaviano-ios && xcodegen generate` → `Ottaviano.xcodeproj` with the
   `OttavianoKDS` app target depending on the local `OttavianoKit` SwiftPM package.
2. Set `OTTAVIANO_API_BASE_URL` (e.g. `https://sud-italia.vercel.app/api/v1`) — the
   only host reference, so the Vercel exit needs no code change (§2.1).
3. `xcodebuild build -scheme OttavianoKDS -destination 'generic/platform=iOS Simulator'`
   (CI: `.github/workflows/ios-swift.yml`; TestFlight: `ios-swift-testflight.yml`).

## Targets
iOS 18+ deployment (built with the latest SDK), Swift 6 (strict concurrency).
iPad-first operator app; universal (iPhone + iPad).
