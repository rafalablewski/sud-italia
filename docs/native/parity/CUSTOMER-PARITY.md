# Ottaviano (customer app) ↔ Web Storefront — Parity Ledger

> Companion to `PARITY-LEDGER.md` (which covers the **operator** app). This maps
> the **customer** React Native app (`native/ottaviano-rn`, `ottaviano` skin)
> against the web storefront surfaces documented under
> `docs/design-system/homepage/pages/*` and the `/api/v1` facade it consumes.
> Source-level audit (the app can't be screenshotted from this container).
>
> Legend: ✅ at parity · 🟡 functional, gap noted (reason given) · — n/a on mobile.

## Surface map

| Native screen | Web surface | `/api/v1` endpoints | State |
|---|---|---|---|
| `MenuScreen` (Order tab) | `menu.md` — location menu | `/locations`, `/menu`, `/settings/public` | ✅ search · `All`+category tabs · live open-now pill · speed-guarantee banner · combo previews · item cards |
| `ItemDetailScreen` | `menu.md` — `ItemDetailDrawer` | (menu DTO) | ✅ allergens · nutrition readout · modifier picker (radio/checkbox, required-gated) · live re-quoting paybar |
| `CartScreen` | `checkout.md` — cart drawer | `/upsell`, `/settings/public`, `POST /orders` | 🟡 lines+modifiers · per-line notes · cross-sell rail · combo discount (real total, Rule #8) · tip picker · fulfilment + delivery address + dine-in party · loyalty earn preview · min-order gate. **Gaps:** slot picker, address autocomplete, referral-code entry (no facade route — see below) |
| `OrderTrackerScreen` | `order.md` — confirmation/tracker | `GET /customer/orders/:id`, `…/stream` (SSE) | 🟡 live steps · ETA · fulfilment chip · order summary · points-earned · share. **Gaps:** in-app feedback survey, push opt-in |
| `OrdersScreen` | (order history) | `GET /customer/orders`, `/menu` (reorder) | ✅ Active⇄Past · tap → tracker · one-tap **Reorder** (resolves dishes against live menu) |
| `RewardsScreen` | `loyalty.md` — `/rewards` | `GET /customer/me`, `/settings/public` | 🟡 tier card + live progress · tier roadmap · rewards catalogue (affordable/locked) · referral terms · how-it-works. **Gaps:** points redemption, family wallet, challenges/achievements, personal referral code |
| `MoreScreen` | (account) | `/customer/account[/export]` | ✅ account · locations · privacy · export · delete · sign out |

## What this pass added

- **`GET /api/v1/settings/public`** (new facade route) — the single programme
  read: loyalty tier ladder + rewards catalogue + referral, the combo ladder,
  speed-guarantee, and delivery/tip/min-order config. Mapped from the live
  `getLoyaltySettings()`/`getSettings()` store (Rule #1).
- **`POST /api/v1/upsell`** (new facade route) — the storefront
  `getCartSuggestions` "complete your meal" rail, the customer twin of the staff
  POS suggestions panel.
- Native: a typed menu DTO (`modifierGroups`/`nutrition` no longer opaque), a
  modifier-aware cart store (lines keyed by item + chosen options), shared
  `menu`/`loyalty`/`combos` pure-logic libs ported from the web, a `settings`
  store, expanded accessible primitives (`SegmentedControl`, `Stepper`, `Badge`,
  `ProgressBar` — all with a11y roles + ≥44pt targets), and a `components/customer`
  set (`MenuItemCard`, `ModifierPicker`, `CrossSellRail`, `ComboBanner`, `DishMeta`).

## Honest gaps (not faked — Rule #1)

These web features have **no `/api/v1` route** yet, so the native app does not
render a non-functional control for them. Each needs an additive facade endpoint
before it can land:

- **Slot picker / scheduled fulfilment** — `/api/slots` is admin-only over v1.
  The app sends `immediate: true` (ASAP) orders.
- **Delivery address autocomplete** — no `/api/v1/address/autocomplete`; the app
  takes a free-text address (server validates at checkout).
- **Loyalty redemption + family wallet + challenges/achievements** — the
  `/api/customer/wallet/*` + rewards-stats routes aren't on the facade; Rewards
  shows the catalogue + tier ladder (read-only) honestly.
- **Referral code entry + personal code** — `/api/referrals` isn't on the facade;
  Rewards shows the give-get **terms** from `/settings/public` but not a code.
- **Feedback survey + push opt-in** on the tracker — no `POST /api/v1/feedback`
  / push-subscribe route yet.

Closing these is the next customer-parity wave; each is one additive, Zod-typed,
OpenAPI-published route plus its native surface.
