# ottaviano-rn — the React Native apps

The native rebuild of **Ottaviano** (customer) and **OttavianoKDS** (operator),
in **bare React Native 0.79.5** (no Expo). This replaces the retired SwiftUI seed
(`native/ottaviano-ios`, deleted): one TypeScript codebase, shared with the web,
built with the team's own Xcode pipeline — **XcodeGen + CocoaPods + xcodebuild**,
shipped via **GitHub Actions** or **Xcode Cloud** using the App Store Connect API
key (no EAS, no Expo cloud).

> **Goal: web parity, 1:1.** The screens mirror the web IA exactly. The operator
> console reproduces the web admin rail section-for-section (the 54-surface
> `OPERATOR_NAV`, generated from `src/admin-v3/nav.config.ts` + `src/core/routes.ts`),
> and the Kitchen Display reproduces `src/core/kds/CoreKds.tsx` — same lanes, tone
> tiers, SLA meter, bump/recall/86. The customer app reproduces the storefront's
> tabs and the full order path (browse → cart → checkout → live tracking).

## Layout
```
index.js                          AppRegistry.registerComponent("Ottaviano", App)
App.tsx                           providers (sessions) + NavigationContainer + RootNavigator
ios/                              the committed native project (see "Build")
src/
  navigation/ RootNavigator (Launch · Customer · Operator) + CustomerNavigator
              (Tabs + Cart + OrderTracker) + CustomerTabs (Order·Rewards·Orders·More)
              + OperatorNavigator (Login ⇄ Surface, session-gated) + types
  screens/
    LaunchScreen.tsx              launcher → customer | operator
    customer/  Menu (search · category tabs · open-now · combos) · ItemDetail
               (modifier picker · allergens · nutrition) · Cart (modifiers ·
               cross-sell · combo · tip · fulfilment/address/party → POST
               /api/v1/orders) · OrderTracker (SSE · ETA · points) · Rewards
               (tier roadmap · catalogue · referral) · Orders (active/past ·
               reorder) · More
    operator/  OperatorLoginScreen · OperatorSurfaceScreen (universal renderer)
  api/        client (envelope + bearer + rotating refresh), sse (XHR), types, public, config
  auth/       OperatorSession + CustomerSession (Keychain refresh, refresh-on-401)
  theme/      tokens (generated from web CSS) + ThemeProvider (two skins)
  nav/        roles + operatorNav (generated structure + icon map + role filter)
  components/ ui primitives (Card, Button, Pill, SegmentedControl, Stepper,
              Badge, ProgressBar, StatTile, …) + customer/ (MenuItemCard,
              ModifierPicker, CrossSellRail, ComboBanner, DishMeta)
  features/
    kds/      KdsScreen + TicketCard + Fleet + EightySixSheet + useOrdersStream + kdsLogic
    operator/ OperatorShell (slide-in drawer) + Dashboard + OrdersBoard + DataSurface
              + SurfaceScaffold + surfaceConfig
    customer/ SignIn (phone OTP)
  store/      cart (lines keyed by item+modifiers; tip/fulfilment/address/party) +
              settings (public programme config) — both zustand
  lib/        format (money/clock) + menu (modifier math · diet · open-now) +
              loyalty (tier ladder) + combos (deal eval) + secureStore
```

Navigation is **React Navigation** (native-stack + bottom-tabs); the operator
drawer is a custom slide-in `Modal` (`OperatorShell`), so no gesture-handler /
reanimated is needed. Secure storage is `react-native-keychain`; icons are
`react-native-vector-icons` (MaterialCommunityIcons).

## What's live
- **Customer (web-storefront parity):** the **Order** tab is the full menu —
  search, `All` + per-category tabs, a live **open-now** pill (off the location's
  hours), an operator-set **speed-guarantee** banner and **combo** previews; its
  cards open a real **item-detail** sheet (allergens, bilingual nutrition
  readout, and a **modifier picker** — radio/checkbox, required-gated off
  `MenuItem.modifierGroups`, with a live re-quoting paybar). The **Cart** is the
  whole checkout: modifier-keyed lines + per-line notes, the **cross-sell**
  pairing rail (`POST /upsell`), a **combo banner** that subtracts the real
  saving (Rule #8), a **tip** picker, a fulfilment toggle revealing a delivery
  **address** or a dine-in **party** stepper, the **loyalty earn preview** +
  min-order gate, then a server-priced `POST /orders` carrying the chosen
  modifiers / tip / address / party. The **tracker** adds an ETA card, fulfilment
  chip, points-earned and share; **Orders** splits Active⇄Past with one-tap
  **Reorder**; **Rewards** is the tier card with live progress, the full tier
  **roadmap**, the **rewards catalogue** (affordable vs locked) and **referral**
  terms — all off `GET /settings/public`. Programme config is never hardcoded
  (Rule #1). Stripe PaymentSheet is the next step (endpoint is wired).
- **Operator:** the full 54-surface shell with a role-filtered drawer; the
  **Kitchen Display** at depth (live lanes, Floor/Chef/Fleet, bump/recall/86,
  all-day, station filter); the **Orders board** (SSE) and **Dashboard/Reports**
  (summary). Every other surface is genuinely data-backed off its
  `/api/v1/admin/*` endpoint via the generic `DataSurface` (no mock data — real
  rows or an honest scaffold). SOC 2 + Capabilities are honest parity scaffolds
  (content pages with no data source — the Rule #9/#11 ledger lives on the web).

## Parity is generated (drift-gated)
The skins and the operator IA are **generated from the web source** so they can't
drift — the same gate the SwiftUI seed used, repointed here:
- `src/theme/tokens.generated.ts` ← `scripts/gen-native-tokens.ts` ← web token CSS.
- `src/nav/operatorNav.generated.ts` ← `scripts/gen-native-nav.ts` ← `nav.config.ts`.

Run from the **backend repo root**: `npm run gen:native` (regenerate) /
`npm run check:native` (CI drift gate). `operatorNav.ts` and `tokens.ts` add only
the native-presentation layer (icons, spacing/type) on top of the generated data.

## Build
This Linux dev container can't run an iOS build (needs macOS/Xcode) — the iOS
source under `ios/` is reviewable, CI builds it. The native project is **not**
committed as a binary: `ios/project.yml` (XcodeGen) is the readable source of
truth and the `.xcodeproj` + `.xcworkspace` + `Pods/` are generated and
gitignored.

The build is a four-step pipeline (macOS):

```bash
cd native/ottaviano-rn
npm install                              # 1. JS deps -> node_modules
cd ios && xcodegen generate              # 2. project.yml -> Ottaviano.xcodeproj
cd .. && bundle install                  #    CocoaPods toolchain
cd ios && bundle exec pod install        # 3. -> Ottaviano.xcworkspace
# 4. Always build the WORKSPACE (RN + CocoaPods), never the bare .xcodeproj:
xcodebuild build \
  -workspace ios/Ottaviano.xcworkspace \
  -scheme OttavianoKDS \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO
```

`npm run xcodegen` and `npm run pods` wrap steps 2 and 3. The app target carries
the RN **"Bundle React Native code and images"** build phase (runs
`react-native-xcode.sh`), so Release/archive builds embed `main.jsbundle`.
`ENABLE_USER_SCRIPT_SANDBOXING` is `NO` so that phase can shell out to node. The
`MaterialCommunityIcons.ttf` font (react-native-vector-icons) is bundled as a
resource and registered via `UIAppFonts`; if you add more icon fonts, either add
them to `project.yml` or run `npx react-native-asset` to copy + register them.

**CI smoke build:** the *Mobile app CI* workflow (`.github/workflows/ios.yml`)
runs the four steps above and a no-signing simulator build of `OttavianoKDS` on
every push under `native/ottaviano-rn/**`.

**Ship to TestFlight (GitHub Actions):** the *Mobile app — TestFlight* workflow
(`.github/workflows/ios-testflight.yml`) runs `Scripts/testflight.sh <Scheme>`,
which does `xcodebuild archive` (workspace) → `-exportArchive`
(`app-store-connect`, team `T4WC9M8Y3S`, automatic signing) → `xcrun altool
--upload-app`, authenticated with the App Store Connect API key. Required repo
secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`. Dispatch it manually (pick
`Ottaviano` or `OttavianoKDS`, default `OttavianoKDS`) or push to a `claude/**`
branch with `[testflight]` in the commit message (`(KDS)` selects the KDS scheme).

**Ship via Xcode Cloud:** `ios/ci_scripts/ci_post_clone.sh` runs the same
node → xcodegen → pod install bootstrap so Xcode Cloud can build the workspace.

Set the `/api/v1` origin in the app's runtime config (the only host reference, so
the Vercel exit needs no native change).

> **App icon:** `ios/Ottaviano/Images.xcassets/AppIcon.appiconset` uses the iOS
> single-size (1024×1024) slot and references `icon-1024.png`, which is **not
> committed yet**. Add an opaque 1024 PNG before a real TestFlight/App Store
> upload — simulator/CI builds pass without it, but App Store Connect rejects a
> missing icon. Both targets share this one asset catalog.

## Two apps, one codebase
Both targets boot the **same** JS bundle and the same RN moduleName
**`Ottaviano`** (`AppRegistry.registerComponent('Ottaviano', () => App)`); the
shared `ios/Ottaviano/AppDelegate.swift` drives both. They differ only in three
things, expressed in `ios/project.yml`:

| | **Ottaviano** (customer) | **OttavianoKDS** (operator) |
| --- | --- | --- |
| Bundle id | `pl.ottaviano.customer` | `pl.ottaviano.kds` |
| Display name | Ottaviano | OttavianoKDS |
| Info.plist orientation | portrait-first iPhone | landscape-first iPad |

Each is universal (`TARGETED_DEVICE_FAMILY 1,2`), iOS 18.0, MARKETING_VERSION
`0.3.0`. OttavianoKDS is an internal staff tool — Apple usually routes those
through Apple Business Manager (custom/unlisted), and a public submission needs a
working demo login.
