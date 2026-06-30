# ottaviano-rn — the React Native (Expo) apps

The native rebuild of **Ottaviano** (customer) and **OttavianoKDS** (operator),
in React Native + Expo + expo-router. This replaces the retired SwiftUI seed
(`native/ottaviano-ios`, deleted): one TypeScript codebase, shared with the web,
buildable via **GitHub Actions (EAS)** or **Xcode**.

> **Goal: web parity, 1:1.** The screens mirror the web IA exactly. The operator
> console reproduces the web admin rail section-for-section (the 54-surface
> `OPERATOR_NAV`, generated from `src/admin-v3/nav.config.ts` + `src/core/routes.ts`),
> and the Kitchen Display reproduces `src/core/kds/CoreKds.tsx` — same lanes, tone
> tiers, SLA meter, bump/recall/86. The customer app reproduces the storefront's
> tabs and the full order path (browse → cart → checkout → live tracking).

## Layout
```
app/                              expo-router routes (file-based)
  _layout.tsx                     providers (sessions) + root Stack
  index.tsx                       launcher → customer | operator
  customer/                       Ottaviano (warm parchment skin)
    _layout.tsx                   Tabs: Order · Rewards · Orders · More
    index.tsx                     menu browse + add to cart
    cart.tsx                      cart → POST /api/v1/orders (guest or customer)
    order/[id].tsx                live order tracker (SSE)
    rewards.tsx · orders.tsx · more.tsx
  operator/                       OttavianoKDS (always-dark KDS skin)
    _layout.tsx · login.tsx · index.tsx
    surface/[...path].tsx         universal surface renderer (resolves OPERATOR_NAV)
src/
  api/        client (envelope + bearer + rotating refresh), sse (XHR), types, public, config
  auth/       OperatorSession + CustomerSession (Keychain-stored refresh, refresh-on-401)
  theme/      tokens (generated from web CSS) + ThemeProvider (two skins)
  nav/        roles + operatorNav (generated structure + icon map + role filter)
  components/ ui primitives (Card, Button, Pill, StatTile, …)
  features/
    kds/      KdsScreen + TicketCard + Fleet + EightySixSheet + useOrdersStream + kdsLogic
    operator/ OperatorShell (drawer) + Dashboard + OrdersBoard + DataSurface + scaffold + surfaceConfig
    customer/ SignIn (phone OTP)
  store/      cart (zustand)
  lib/        format (money/clock)
```

## What's live in this first cut
- **Customer:** full order path (menu → cart → server-priced `POST /orders` →
  live SSE tracker), Rewards (loyalty card), Orders history, account
  delete/export. Stripe PaymentSheet is the next step (endpoint is wired).
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
This Linux dev container can't run an iOS simulator (needs macOS/Xcode), and the
Expo dependencies aren't installed here — the source is reviewable, CI builds it.

```bash
cd native/ottaviano-rn
npm install
npm run typecheck          # what "Mobile app CI" runs on every push
npx expo start             # dev (web preview works in this container)
```

**Ship via GitHub Actions (EAS):** the *Mobile app — EAS build* workflow runs
`eas build` (set the `EXPO_TOKEN` repo secret; configure Apple signing once with
`eas credentials`). **Or via Xcode:** `npx expo prebuild -p ios` generates the
native project, then open `ios/*.xcworkspace`.

Set `EXPO_PUBLIC_API_BASE_URL` (or `app.json` → `extra.apiBaseUrl`) to the
`/api/v1` origin — the only host reference, so the Vercel exit needs no code
change.

## Two apps, one codebase
The launcher (`app/index.tsx`) routes into either experience. To ship two App
Store apps, add an `app.config.ts` reading an `APP_VARIANT` env to set the bundle
id + initial route per target; the screens are unchanged. OttavianoKDS is an
internal staff tool — Apple usually routes those through Apple Business Manager
(custom/unlisted), and a public submission needs a working demo login.
