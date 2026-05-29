# Hardcoded-values / data-consistency audit

**Scope:** every place where data that should be Admin-managed (or already has a store API) is hardcoded in a consumer.
**Source-of-truth decisions:** menu = code seed (`src/data/menus/*`); branding/theme = code; feature flags = `getSettings()` going forward, `process.env` only for secrets/bootstrap.
**Status:** Phase 0 sweep complete. Phases 1–7 not started.

## Severity rubric

- **P0** — admin change has zero effect on the customer, or two sources of truth disagree silently.
- **P1** — admin change requires a deploy; or a server route uses the seed where it should use the live store.
- **P2** — cosmetic mismatch / DX papercut.

## Findings

| # | area | symbol | file:line | current source | should-be source | sev | fix sketch |
|---|------|--------|-----------|----------------|------------------|-----|------------|
| 1 | Loyalty | `REWARDS` (catalog of 5 rewards) | `src/lib/loyalty.ts:52` | hardcoded array, consumed by `/rewards` page + `/api/customer/wallet/redeem` | `getLoyaltySettings().rewards` (new field) + admin UI in `/admin/loyalty` | P0 | Move to loyalty settings; migrate seed into DB defaults; redeem route reads from settings. |
| 2 | Loyalty | `TIER_THRESHOLDS` (0/500/1500/5000) | `src/lib/loyalty.ts:16` | hardcoded record | `getLoyaltySettings().tiers.{tier}.threshold` | P0 | Settings already has tier shape (`store.ts:3006`); collapse the two sources into one and have `loyalty.ts` read from settings. |
| 3 | Loyalty | `TIER_CONFIG` (perks, multipliers, labels, colors) | `src/lib/loyalty.ts:22` | hardcoded record with customer-facing promises ("Free delivery", "VIP events") | settings for multiplier + perks; theme-managed for color/label | P0 | Multipliers + perks → settings (admin-editable); label + color stay in code (theme). |
| 4 | Loyalty | duplicate tier config | `src/lib/store.ts:3006-3009` | second hardcoded copy of the same thresholds + perks | single source via settings | P0 | Same fix as #2/#3 — delete the duplicate after the migration lands. |
| 5 | Fiscal | `VAT_RATE = 0.08` | `src/lib/jpk.ts:34` | hardcoded 8% VAT for JPK exports | `resolveLocationCompliance(...)` per location + tax category | P0 | Compliance settings already exist (`DEFAULT_COMPLIANCE_CONFIG` in store); read VAT per location from there. Mis-stated VAT = fiscal risk. |
| 6 | Brand | `CONTACT_EMAIL`, `CONTACT_PHONE` | `src/lib/constants.ts:15-16` | hardcoded operational contact | `getSettings().contact.{email,phone}` | P0 | Per Q4 branding = code, but contact info is operational, not brand — must be admin-editable. |
| 7 | Brand | `SOCIAL_LINKS` (IG / FB / TikTok URLs) | `src/lib/constants.ts:7` | hardcoded URLs | `getSettings().social.*` | P1 | Same reasoning as #6. Today they change without a code review = high churn. |
| 8 | Locations | `ACTIVE_LOCATIONS = ["krakow", "warszawa"]` (server tool) | `src/lib/whatsapp/tools.ts:41` | hardcoded literal in WhatsApp tool router | `getActiveLocationsAsync()` from `@/lib/locations-store` | P0 | Server-side — must use live store. Hardcoded list breaks when a third truck opens. |
| 9 | Locations | server-side seed reads | `src/lib/store.ts:6` (`allLocations` from seed), `src/lib/kitchen-auth.ts:4`, `src/lib/comms/dispatcher.ts:7`, `src/lib/whatsapp/tools.ts:12`, `src/app/api/settings/upsell/route.ts:3` | server reads `getActiveLocations()` (seed sync) | `getActiveLocationsAsync()` (live store) for server paths | P1 | Per `src/data/locations.ts` docstring, server should use the async live store. Audit each: confirm sync seed is justified (e.g. bootstrap before DB exists) vs. needs migration. |
| 10 | Locations | hardcoded `{krakow, warszawa}` dropdowns in admin | `AdminCrm.tsx:252`, `AdminConcierge.tsx:62`, `WhatsAppSettingsDialog.tsx:308`, `AdminSellingShared.tsx:191`, `ModifierInventory.tsx:25` | hardcoded slug+label arrays | `getActiveLocations()` (client) or `getActiveLocationsAsync()` (server) | P1 | Same pattern in 5 admin components; replace with helper. Breaks the moment a 3rd location ships. |
| 11 | Menu | direct `krakowMenu` / `warszawaMenu` imports | `ModifierInventory.tsx:25-26`, `AdminSellingShared.tsx:191-192` | direct seed imports | iterate `getActiveLocations()` + `getMenuWithOverrides(slug)` | P1 | Today these never reflect runtime overrides (price, availability, hidden items). Editing in admin → no effect here. |
| 12 | Cart copy | static button strings ("Add to cart", "Pay", "Delivery", "Order now") | `CartDrawer.tsx:683/1025`, `ItemDetailDrawer.tsx:253`, `BundlesShowcase.tsx:195`, `AdminSlots.tsx:597/730` | hardcoded JSX text | i18n via `src/lib/i18n.ts` (needs Q3 answer) | P1 | Blocks localization. Defer to Phase 6 — depends on i18n adoption status. |
| 13 | Layout | `NAV_LINKS` | `src/components/layout/Header.tsx:22` | hardcoded nav config | OK as code (structural, not data) | P2 | No fix — flag only if a CMS-driven menu is planned. |
| 14 | Order UI | `STATUS_STEPS` (order tracker labels) | `src/components/order/OrderTracker.tsx:23` | hardcoded status labels | i18n strings | P2 | Defer to Phase 6 (i18n). |
| 15 | Cart placeholder | `placeholder="0.00 zł"` | `src/components/cart/CartDrawer.tsx:1165` | hardcoded currency symbol in placeholder | `formatPriceInCurrency(0, settings.currency)` | P2 | Cosmetic; breaks if non-PLN currency is enabled (admin currency UI already supports USD/EUR/SGD). |
| 16 | Branding | hex colors in inline SVG illustrations | `CartUpsell.tsx`, `CartItem.tsx`, `FloatingCartButton.tsx`, `DeliveryProgress.tsx` | hex literals in `<path fill>` / `<circle fill>` | OK — illustrations are code-managed per Q4 | — | No fix. Documented in design-system doc as illustration tokens if not already. |
| 17 | Currency | inline `"PLN"` in non-store consumers | `src/app/(public)/locations/[slug]/page.tsx:104` (JSON-LD `priceCurrency`) | hardcoded `"PLN"` in schema.org markup | `getSettings().currency.defaultCurrency` | P2 | Cosmetic until multi-currency SEO matters. |

## Verified clean (no action)

| area | check | result |
|------|-------|--------|
| `src/data/menus/{krakow,warszawa}.ts` | menu source of truth | code seed per Q1 ✅ |
| `src/data/locations.ts` | client-side seed fallback | documented + correct pattern ✅ |
| `src/data/menu-ui.ts` (CATEGORY_ICONS/COLORS) | theme | code per Q4 ✅ |
| `getMenuWithOverrides()` consumers | every order/cart/checkout path | 12 consumers all funnel through the helper ✅ |
| `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` in client | env in `"use client"` | public key, correct usage ✅ |
| `process.env.NODE_ENV === "development"` in client | env in `"use client"` | inlined at build, correct ✅ |
| Server modules in client | grep for `@/lib/store`/`next/headers`/`@neondatabase/serverless` in `"use client"` files | only hit was `experiments-server.ts` (server file, name says so) ✅ |
| `process.cwd()` / `fs` direct reads | Rule #2 | only `src/lib/store.ts:28` (`DATA_DIR` for the FS fallback) ✅ |

## Open questions (defer)

- **Q3 (i18n):** items #12, #14 block until status is confirmed.
- **Q5 (KDS deploy model):** not yet investigated — will surface in Phase 5.
- **Q9 (email/SMS templates):** not yet investigated — Phase 7.

## Phase plan (recap)

- **Phase 1** — Money flow: pick off #5 (VAT) + #15/#17 (currency cosmetics).
- **Phase 2** — Menu: only #11 to address; the rest already correct.
- **Phase 3** — Locations: #8, #9, #10 — single-PR sweep.
- **Phase 4** — Loyalty: #1, #2, #3, #4 — biggest fix, biggest schema change. Likely needs `/admin/capabilities` update (Rule #9). No theme code touched → no Rule #11 doc update.
- **Phase 5** — KDS/POS: TBD (need Q5).
- **Phase 6** — Copy/i18n: #12, #14 — Rule #11 doc updates expected.
- **Phase 7** — Compliance/flags: #6, #7 (contact + social) + any leftover env flags.

## Ledger

| phase | PR | status |
|-------|----|--------|
| 0 | tracker landed | done |
| 1 | money flow | not started |
| 2 | menu | not started |
| 3 | locations | not started |
| 4 | loyalty | not started |
| 5 | kds/pos | not started |
| 6 | copy/i18n | not started |
| 7 | compliance/flags | not started |
