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
| 1 | ~~Loyalty~~ | ~~`REWARDS`~~ | ~~`src/lib/loyalty.ts:52`~~ | `getLoyaltySettings().rewards`; redeem route validates active flag server-side | — | ~~P0~~ | **DONE (Phase 4).** |
| 2 | ~~Loyalty~~ | ~~`TIER_THRESHOLDS`~~ | ~~`src/lib/loyalty.ts:16`~~ | `getLoyaltySettings().tiers.{tier}.threshold` | — | ~~P0~~ | **DONE (Phase 4).** Helpers take ladder as param. |
| 3 | ~~Loyalty~~ | ~~`TIER_CONFIG`~~ | ~~`src/lib/loyalty.ts:22`~~ | `getLoyaltySettings().tiers.{tier}.{label,multiplier,perks}`; `TIER_COLORS` stays code (theme) | — | ~~P0~~ | **DONE (Phase 4).** Tier label now editable too. |
| 4 | ~~Loyalty~~ | ~~duplicate tier config~~ | ~~`src/lib/store.ts:3006-3009`~~ | single source via settings | — | ~~P0~~ | **DONE (Phase 4).** lib/loyalty.ts duplicates deleted, store.ts is the single canonical shape. Admin edits at /admin/growth → Tiers and → Rewards. |
| 5 | ~~Fiscal~~ | ~~`VAT_RATE = 0.08`~~ | ~~`src/lib/jpk.ts:34`~~ | resolved per location via `vatRateBps` on `LocationComplianceConfig` (default 800 bps) | — | ~~P0~~ | **DONE (Phase 1, Step 1.1).** Added `vatRateBps` field, refactored `jpk.ts` to compute per-row, surfaced operator input in EU panel of `/admin/regulatory-compliance`, extended Zod schema, refreshed capabilities entry. Backward-compatible (default still 8%). |
| 6 | Brand | `CONTACT_EMAIL`, `CONTACT_PHONE` | `src/lib/constants.ts:15-16` | hardcoded operational contact | `getSettings().contact.{email,phone}` | P0 | Per Q4 branding = code, but contact info is operational, not brand — must be admin-editable. |
| 7 | Brand | `SOCIAL_LINKS` (IG / FB / TikTok URLs) | `src/lib/constants.ts:7` | hardcoded URLs | `getSettings().social.*` | P1 | Same reasoning as #6. Today they change without a code review = high churn. |
| 8 | ~~Locations~~ | ~~`ACTIVE_LOCATIONS = ["krakow", "warszawa"]`~~ | ~~`src/lib/whatsapp/tools.ts:41`~~ | `getActiveLocationsAsync()`; `WaSession.locationSlug` widened from `"krakow"\|"warszawa"\|null` to `string \| null` | — | ~~P0~~ | **DONE (Phase 3, 3a).** isActiveLocation + locationName both async, set-location tool surfaces the live slug list in errors. |
| 9 | ~~Locations~~ | ~~server-side seed reads~~ | ~~`store.ts:6`, `kitchen-auth.ts:4`, `comms/dispatcher.ts:7`, `whatsapp/tools.ts:12`, `api/settings/upsell/route.ts:3`~~ | `getActiveLocationsAsync()` everywhere | — | ~~P1~~ | **DONE (Phase 3, 3b).** store.ts drops the seed alias entirely; isActiveLocationSlug + kitchen-auth.verifyKitchenCredentials + comms.locationNameFor all async; upsell route validates slug live on each call. Also touched cart-presence route + kitchen login route to await the now-async helpers (login also swapped to getLocationAsync). |
| 10 | ~~Locations~~ | ~~hardcoded `{krakow, warszawa}` dropdowns in admin~~ | ~~`AdminCrm.tsx:252`, `AdminConcierge.tsx:62`, `WhatsAppSettingsDialog.tsx:308`, `AdminSellingShared.tsx:191`, `ModifierInventory.tsx:25`~~ | `getActiveLocations()` seed | — | ~~P1~~ | **DONE.** AdminSellingShared + ModifierInventory closed in Phase 2 (`a151b0b`); AdminCrm + AdminConcierge + WhatsAppSettingsDialog closed in Phase 3 (3c). New trucks auto-appear in every dropdown. |
| 11 | ~~Menu~~ | ~~direct `krakowMenu` / `warszawaMenu` imports~~ | ~~`ModifierInventory.tsx:25-26`, `AdminSellingShared.tsx:191-192`~~ | `getActiveLocations()` + `getMenu(slug)` seed fallback; `ModifierInventory` also fetches `/api/admin/menu?location=` so runtime overrides surface | — | ~~P1~~ | **DONE (Phase 2).** AdminSellingShared LOCATIONS derived from `getActiveLocations()`; new active trucks pick up automatically. ModifierInventory was rendering static seed (latent bug); now reads live menu with seed fallback. |
| 12 | Cart copy | static button strings ("Add to cart", "Pay", "Delivery", "Order now") | `CartDrawer.tsx:683/1025`, `ItemDetailDrawer.tsx:253`, `BundlesShowcase.tsx:195`, `AdminSlots.tsx:597/730` | hardcoded JSX text | i18n via `src/lib/i18n.ts` (needs Q3 answer) | P1 | Blocks localization. Defer to Phase 6 — depends on i18n adoption status. |
| 13 | Layout | `NAV_LINKS` | `src/components/layout/Header.tsx:22` | hardcoded nav config | OK as code (structural, not data) | P2 | No fix — flag only if a CMS-driven menu is planned. |
| 14 | Order UI | `STATUS_STEPS` (order tracker labels) | `src/components/order/OrderTracker.tsx:23` | hardcoded status labels | i18n strings | P2 | Defer to Phase 6 (i18n). |
| 15 | ~~Cart placeholder~~ | ~~`placeholder="0.00 zł"`~~ | ~~`src/components/cart/CartDrawer.tsx:1165`~~ | `formatPrice(0)` (resolves to the customer's display currency) | — | ~~P2~~ | **DONE (Phase 1, Step 1.2).** Placeholder + aria-label now currency-agnostic. Tip values still grosze on the cart store; this is display-only. |
| 16 | Branding | hex colors in inline SVG illustrations | `CartUpsell.tsx`, `CartItem.tsx`, `FloatingCartButton.tsx`, `DeliveryProgress.tsx` | hex literals in `<path fill>` / `<circle fill>` | OK — illustrations are code-managed per Q4 | — | No fix. Documented in design-system doc as illustration tokens if not already. |
| 17 | ~~Currency~~ | ~~inline `"PLN"` in JSON-LD~~ | ~~`src/app/(public)/locations/[slug]/page.tsx:104`~~ | `location.currency` (per-location transaction currency, scope-local) | — | ~~P2~~ | **DONE (Phase 1, Step 1.3).** Picked `location.currency` over a global settings read because schema.org `priceCurrency` is per-Offer and tracks the actual transaction currency for that location — future-ready when the Location type broadens beyond the `"PLN"` literal. Zero behavior change today. |

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
| 1 | money flow | **complete** — 1.1 VAT, 1.2 cart placeholder, 1.3 JSON-LD currency |
| 2 | menu | **complete** |
| 3 | locations | **complete** (3a whatsapp, 3b server sweep, 3c admin dropdowns) |
| 4 | loyalty | **complete** (4a-c collapse to settings · 4d admin label input + UI confirmed · 4e docs) |
| 5 | kds/pos | not started |
| 6 | copy/i18n | not started |
| 7 | compliance/flags | not started |
