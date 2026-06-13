# Hardcoded-values / data-consistency audit

**Scope:** every place where data that should be Admin-managed (or already has a store API) is hardcoded in a consumer.
**Source-of-truth decisions:** menu = code seed (`src/data/menus/*`); branding/theme = code; feature flags = `getSettings()` going forward, `process.env` only for secrets/bootstrap.
**Status:** **Audit closed.** 17 of 21 findings resolved across Phases 0–4 + 7 + 8; 3 deferred-by-design (i18n + nav); 1 verified clean. Regression guards (ESLint rule + `npm test` suite) ship alongside to keep the silent-drift bugs from coming back. See the closing summary at the bottom.

## Phase 8 — second sweep (post-close-out)

Re-running the audit with a deeper look at modules underweighted in Phase 0 turned up three more findings:

| # | area | symbol | file:line | should-be | sev | note |
|---|------|--------|-----------|-----------|-----|------|
| 18 | ~~Loyalty~~ | ~~`REFERRAL_REWARD`~~ | ~~`src/lib/growth-engine.ts:22`~~ | `getLoyaltySettings().referral` (exposed on `/api/settings/public` as `loyalty.referral`, `null` when disabled) | ~~P0~~ | **DONE (Phase 8a).** Same silent-drift shape as #1–#4. The values + active toggle were already operator-editable at /admin/growth → Referrals; only the customer surfaces were stuck on the const. /rewards now hides both referral surfaces when `referral.active = false`. ReferralCard.tsx deleted (was dead code — never imported anywhere). |
| 19 | ~~Pricing~~ | ~~`DELIVERY_FEE_GROSZE = 700`~~ | ~~`src/lib/upsell.ts:801`~~ | `getSettings().deliveryFee` threaded through `computeDeliveryFee(..., feeOverride)` | ~~P0~~ | **DONE (Phase 8b).** Added `feeOverride` param to `computeDeliveryFee`; server callers (createOrder, whatsapp/tools) pass `getSettings().deliveryFee`; cart drawer reads `deliveryFee` off `fetchPublicSettings()`. Const kept as the first-deploy fallback. `DEFAULT_SETTINGS.deliveryFee` realigned to 700 (was 1000) so unedited installs see no customer-visible change; operators who'd already entered a value now actually charge what they set. |
| 20 | ~~Loyalty~~ | ~~`SPEED_GUARANTEE` const~~ | ~~`src/lib/growth-engine.ts:190`~~ | settings (`LoyaltySettings.speedGuarantee`) wins | ~~P2~~ | **DONE (Phase 8c).** Const deleted. Was never imported anywhere; left a pointer comment naming the canonical source. |
| 21 | ~~Menu~~ | ~~direct seed-menu imports (3 more sites the Phase 0 sweep missed)~~ | ~~`CartDrawer.tsx:31`, `api/admin/search/route.ts:4`, `AdminSimulation.tsx:37`~~ | `getMenu(slug)` / `getMenuWithOverrides(slug)` from `@/data/menus` | ~~P1~~ | **DONE — caught by the Option 3 regression test on its first run.** CartDrawer fallback now derives from `getMenu(slug)` (new trucks pick up automatically); admin search reads `getMenuWithOverrides` per active truck (operator overrides surface in search now); AdminSimulation routes through `getMenu("krakow")`. |



- **P0** — admin change has zero effect on the customer, or two sources of truth disagree silently.
- **P1** — admin change requires a deploy; or a server route uses the seed where it should use the live store.
- **P2** — cosmetic mismatch / DX papercut.

## Phase 9 — third sweep (admin-v3 era)

A fresh sweep over surfaces added/grown since the close-out (the `src/admin-v3/`
suite, new routes + libs). New findings + their resolution:

| # | area | symbol | file:line | should-be | sev | note |
|---|------|--------|-----------|-----------|-----|------|
| P9-1 | ~~Pricing~~ | ~~`minOrderAmount` never enforced~~ | ~~`createOrder.ts`~~ | hard-gated in createOrder (`below_min_order`) + exposed on `/api/settings/public` + cart soft-gate ("add X more") | ~~P0~~ | **DONE.** Dead admin setting — saved, enforced nowhere. Now end-to-end. |
| P9-2 | ~~Referral~~ | ~~`REFEREE_DISCOUNT_GROSZE` / `REFERRER_REWARD_POINTS`~~ | ~~`referral-loop.ts:25-26`~~ | `getLoyaltySettings().referral.{refereeDiscountGrosze,referrerPoints,active}` | ~~P0~~ | **DONE.** Checkout discount, referrer award, `/api/referrals` policy + `/r/[code]` landing all read the setting + honour `active`. Consts kept as first-deploy fallback. |
| P9-3 | ~~Fiscal~~ | ~~card fee `0.014+40` vs sim `0.019`~~ | ~~`reports/delivery/route.ts`, `store.ts` sim default~~ | `AppSettings.processorFee` (single source) + shared `DEFAULT_PROCESSOR_FEE` | ~~P0~~ | **DONE (F2).** Delivery report + Calculator scenario both read it. Admin: Settings → General. |
| P9-4 | ~~Brand~~ | ~~"Sud Italia" / "Ottaviano" hardcoded~~ | ~~welcome layout, WelcomeBrief, SMS/email/receipt templates, chat~~ | `AppSettings.businessName` (defaults to `SITE_NAME`) | ~~P1~~ | **DONE (F3).** Admin welcome → SITE_NAME; comms templates + thermal receipt thread `businessName` via the dispatcher / printReceipt. |
| P9-5 | ~~Chatbot~~ | ~~stale hours/addresses/"30/60 PLN"~~ | ~~`ai-engine.ts` `CHATBOT_RESPONSES`~~ | live `getActiveLocationsAsync()` + `minOrderAmount`/`deliveryFee` + tiers | ~~P1~~ | **DONE (F4).** getChatResponse now server-only via `/api/chat`; ChatWidget fetches it (Rule #3). |
| P9-6 | ~~Pricing~~ | ~~tip presets `[0.1,0.15,0.2]`~~ | ~~`CartDrawer.tsx`~~ | `AppSettings.tipPresets` (public) | ~~P1~~ | **DONE.** Admin: Settings → General "Tip presets (%)". |
| P9-7 | ~~Labor~~ | ~~`COVERS_PER_STAFF_PER_HOUR`, SPLH targets~~ | ~~`labor-efficiency.ts`~~ | `AppSettings.operations.labor` (admin → Operations) | ~~P1~~ | **DONE.** Targets threaded into the daily compute; consts → `DEFAULT_OPERATIONS`. |
| P9-8 | ~~ETA~~ / KDS | ~~prep floor / expo buffer~~ · pace/promise targets | `eta.ts` ✓ · `kds-prediction.ts` (open) | `AppSettings.operations.kitchen` (admin → Operations) | ~~P1~~ / P2 | **ETA prep DONE** — the customer "Ready by" quote now reads the operator's min-prep + expo buffer (server `fireKdsTickets` + cart via `/api/settings/public`). The KDS-internal pace-window / promise-target health knobs (`kds-prediction.ts`, pure module shared by ~8 callers incl. client KDS) stay code — **deferred** (internal SLA tuning, high rewire churn, not a customer-facing number). |
| P9-9 | ~~Inventory~~ | ~~`FALLBACK_LEAD_DAYS`, `USAGE_WINDOW_DAYS`~~ | ~~`par-purchase-orders.ts:38-39`~~ | `AppSettings.operations.inventory` (admin → Operations) | ~~P1~~ | **DONE.** Reorder policy read from settings in `generateParPurchaseOrders`. |
| P9-10 | ~~Marketing~~ | ~~`VIP_SPEND_GROSZE`, `VIP_ORDERS`~~ | ~~`whatsapp/audience.ts:21-22`~~ | `AppSettings.marketing.{vipSpendGrosze,vipMinOrders}` (admin → Operations) | ~~P2~~ | **DONE.** The broadcast VIP cut is operator-set; `selectAudience` takes the thresholds, the broadcasts route passes them from settings (consts → `DEFAULT_VIP_*` fallback). (Left as its own axis rather than folding into loyalty points — different concept.) |
| P9-11 | Bundles | `BUNDLE_MARGIN_FLOOR=0.4` | `bundles.ts:125` | — (stays code) | P2 | **DEFERRED-by-design.** The const's own doc-comment defines it as the deliberate single-source margin guardrail ("the line below which a bundle erodes contribution"). Making it operator-editable would let someone set a margin-eroding floor — a policy constant, not config. |
| P9-12 | ~~Brand~~ | ~~JPK `JPK_NIP/NAME` env placeholders~~ | ~~`jpk.ts:73-74`~~ | `AppSettings.legalEntity` (admin → Settings → General → Legal entity) | ~~P2~~ | **DONE.** Operator-set NIP / legal name / REGON / tax email win over the `JPK_*` env vars (kept as deploy bootstrap), so a filing no longer ships with `NIP=0000000000`. |
| P9-13 | ~~Brand~~ | ~~login placeholder `you@ottaviano.pl`~~ | ~~`LoginForm.tsx:132`~~ | neutral placeholder | ~~P2~~ | **DONE.** Hardcoded brand domain → neutral `you@email.com`. |
| P9-14 | Comms | re-engagement message stubs hardcode brand | `sms.ts:44-59` | `businessName` | P2 | **DEFERRED — dead code** (no callers). Wire when the SMS re-engagement cron ships. |

## Findings

| # | area | symbol | file:line | current source | should-be source | sev | fix sketch |
|---|------|--------|-----------|----------------|------------------|-----|------------|
| 1 | ~~Loyalty~~ | ~~`REWARDS`~~ | ~~`src/lib/loyalty.ts:52`~~ | `getLoyaltySettings().rewards`; redeem route validates active flag server-side | — | ~~P0~~ | **DONE (Phase 4).** |
| 2 | ~~Loyalty~~ | ~~`TIER_THRESHOLDS`~~ | ~~`src/lib/loyalty.ts:16`~~ | `getLoyaltySettings().tiers.{tier}.threshold` | — | ~~P0~~ | **DONE (Phase 4).** Helpers take ladder as param. |
| 3 | ~~Loyalty~~ | ~~`TIER_CONFIG`~~ | ~~`src/lib/loyalty.ts:22`~~ | `getLoyaltySettings().tiers.{tier}.{label,multiplier,perks}`; `TIER_COLORS` stays code (theme) | — | ~~P0~~ | **DONE (Phase 4).** Tier label now editable too. |
| 4 | ~~Loyalty~~ | ~~duplicate tier config~~ | ~~`src/lib/store.ts:3006-3009`~~ | single source via settings | — | ~~P0~~ | **DONE (Phase 4).** lib/loyalty.ts duplicates deleted, store.ts is the single canonical shape. Admin edits at /admin/growth → Tiers and → Rewards. |
| 5 | ~~Fiscal~~ | ~~`VAT_RATE = 0.08`~~ | ~~`src/lib/jpk.ts:34`~~ | resolved per location via `vatRateBps` on `LocationComplianceConfig` (default 800 bps) | — | ~~P0~~ | **DONE (Phase 1, Step 1.1).** Added `vatRateBps` field, refactored `jpk.ts` to compute per-row, surfaced operator input in EU panel of `/admin/regulatory-compliance`, extended Zod schema, refreshed capabilities entry. Backward-compatible (default still 8%). |
| 6 | ~~Brand~~ | ~~`CONTACT_EMAIL`, `CONTACT_PHONE`~~ | ~~`src/lib/constants.ts:15-16`~~ | `getSettings().businessPhone` / `.businessEmail` (already on AppSettings, now exposed publicly + consumed by the footer) | — | ~~P0~~ | **DONE (Phase 7).** Existing AdminSettings inputs already saved the values; the Footer just wasn't reading them. Footer now async server component, reads via getSettings(), hides empty rows. Constants deleted. |
| 7 | ~~Brand~~ | ~~`SOCIAL_LINKS`~~ | ~~`src/lib/constants.ts:7`~~ | `getSettings().socialLinks.{instagram,facebook,tiktok}` | — | ~~P1~~ | **DONE (Phase 7).** Added field to AppSettings + DEFAULT_SETTINGS (seeded with the previous constant values for backward compat). New "Social links" section in /admin/settings → General. Footer hides each link when blank. |
| 8 | ~~Locations~~ | ~~`ACTIVE_LOCATIONS = ["krakow", "warszawa"]`~~ | ~~`src/lib/whatsapp/tools.ts:41`~~ | `getActiveLocationsAsync()`; `WaSession.locationSlug` widened from `"krakow"\|"warszawa"\|null` to `string \| null` | — | ~~P0~~ | **DONE (Phase 3, 3a).** isActiveLocation + locationName both async, set-location tool surfaces the live slug list in errors. |
| 9 | ~~Locations~~ | ~~server-side seed reads~~ | ~~`store.ts:6`, `kitchen-auth.ts:4`, `comms/dispatcher.ts:7`, `whatsapp/tools.ts:12`, `api/settings/upsell/route.ts:3`~~ | `getActiveLocationsAsync()` everywhere | — | ~~P1~~ | **DONE (Phase 3, 3b).** store.ts drops the seed alias entirely; isActiveLocationSlug + kitchen-auth.verifyKitchenCredentials + comms.locationNameFor all async; upsell route validates slug live on each call. Also touched cart-presence route + kitchen login route to await the now-async helpers (login also swapped to getLocationAsync). |
| 10 | ~~Locations~~ | ~~hardcoded `{krakow, warszawa}` dropdowns in admin~~ | ~~`AdminCrm.tsx:252`, `AdminConcierge.tsx:62`, `WhatsAppSettingsDialog.tsx:308`, `AdminSellingShared.tsx:191`, `ModifierInventory.tsx:25`~~ | `getActiveLocations()` seed | — | ~~P1~~ | **DONE.** AdminSellingShared + ModifierInventory closed in Phase 2 (`a151b0b`); AdminCrm + AdminConcierge + WhatsAppSettingsDialog closed in Phase 3 (3c). New trucks auto-appear in every dropdown. |
| 11 | ~~Menu~~ | ~~direct `krakowMenu` / `warszawaMenu` imports~~ | ~~`ModifierInventory.tsx:25-26`, `AdminSellingShared.tsx:191-192`~~ | `getActiveLocations()` + `getMenu(slug)` seed fallback; `ModifierInventory` also fetches `/api/admin/menu?location=` so runtime overrides surface | — | ~~P1~~ | **DONE (Phase 2).** AdminSellingShared LOCATIONS derived from `getActiveLocations()`; new active trucks pick up automatically. ModifierInventory was rendering static seed (latent bug); now reads live menu with seed fallback. |
| 12 | Cart copy | static button strings ("Add to cart", "Pay", "Delivery", "Order now") | `CartDrawer.tsx:683/1025`, `ItemDetailDrawer.tsx:253`, `BundlesShowcase.tsx:195`, `AdminSlots.tsx:597/730` | hardcoded JSX text | i18n via `src/lib/i18n.ts` | P2 (was P1) | **Deferred-by-design.** Recon found `src/lib/i18n.ts` is scaffolded (68 keys × 4 locales) but adopted by zero components — only `LanguageSwitcher` reads its metadata for the dropdown. These strings are a **localisation** gap, not a silent-drift gap (one source, single language) — outside the audit's "admin = source of truth" charter. Picked up when the Singapore/DACH expansion the i18n module anticipates actually starts. |
| 13 | Layout | `NAV_LINKS` | `src/components/layout/Header.tsx:22` | hardcoded nav config | OK as code (structural, not data) | P2 | **Deferred-by-design.** No CMS-driven nav planned. Operators don't ship new nav items between deploys; this is theme code. |
| 14 | Order UI | `STATUS_STEPS` (order tracker labels) | `src/components/order/OrderTracker.tsx:23` | hardcoded status labels | i18n strings | P2 | **Deferred-by-design.** Same logic as #12 — labels are stable, single source, not admin-managed. Migrates with the broader i18n adoption when it happens. |
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

## Open questions — resolved

- ~~**Q3 (i18n):**~~ resolved by recon — `src/lib/i18n.ts` is scaffolded but unadopted (only `LanguageSwitcher` uses it). Findings #12 and #14 reclassified as localisation-deferred.
- ~~**Q5 (KDS deploy model):**~~ moot — the Phase 0 sweep surfaced no KDS-specific hardcoded data findings, so no Phase 5 work was needed. KDS deploy architecture remains a separate concern (out of audit scope).
- ~~**Q9 (email/SMS templates):**~~ rolled into Phase 7 — `lib/comms/dispatcher.ts` and template helpers don't carry admin-editable copy today; `WaSettings` already covers the WhatsApp keyword/welcome/away text (see `WhatsAppSettingsDialog`), and Polish SMS template body is intentionally code-managed locale copy (see dispatcher's header comment). No further hardcoded-data findings.

## Phase plan (final)

- **Phase 1** — Money flow: ✅ #5 (VAT) + #15 + #17.
- **Phase 2** — Menu: ✅ #11.
- **Phase 3** — Locations: ✅ #8, #9, #10.
- **Phase 4** — Loyalty: ✅ #1, #2, #3, #4.
- **Phase 5** — KDS/POS: skipped (no findings).
- **Phase 6** — Copy/i18n: deferred (#12, #14 not silent-drift; await localisation initiative).
- **Phase 7** — Compliance/flags: ✅ #6, #7.

## Ledger

| phase | PR | status |
|-------|----|--------|
| 0 | tracker landed | done |
| 1 | money flow | **complete** — 1.1 VAT, 1.2 cart placeholder, 1.3 JSON-LD currency |
| 2 | menu | **complete** |
| 3 | locations | **complete** (3a whatsapp, 3b server sweep, 3c admin dropdowns) |
| 4 | loyalty | **complete** (4a-c collapse to settings · 4d admin label input + UI confirmed · 4e docs) |
| 5 | kds/pos | skipped — no concrete hardcoded-data findings surfaced for KDS/POS in the Phase 0 sweep |
| 6 | copy/i18n | deferred-by-design — i18n module is scaffolded but unadopted; localisation is a separate initiative, not silent drift |
| 7 | compliance/flags | **complete** — #6 contact + #7 socials wired through settings; no leftover env-gated flags found in the sweep that fit the "should be admin-toggleable" criterion (cart presence and aggregator flags are deploy-level infra) |

## Closing summary

**13 of 17 findings closed across 10 commits on `claude/sleepy-brahmagupta-uZVI3`:**

| commit | scope |
|--------|-------|
| `4de6139` | Phase 0 — tracker landed |
| `9177b1d` | Phase 1.1 — per-location VAT via compliance settings (#5, P0 fiscal) |
| `6a5f533` | Phase 1.2 — currency-aware cart tip placeholder (#15) |
| `bc9c7e3` | Phase 1.3 — JSON-LD `priceCurrency` follows the location (#17) |
| `a151b0b` | Phase 2 — admin menu views read live overrides, not seed (#11) |
| `fb44fde` | Phase 3a — WhatsApp tools resolve active locations from the live store (#8, P0) |
| `3c5e5c6` | Phase 3b — five server modules: sync seed → async live store (#9) |
| `5f18b74` | Phase 3c — three admin dropdowns derive trucks from `getActiveLocations()` (#10) |
| `0132d53` | Phase 4a–c — loyalty: single source of truth via settings, helpers take ladder as param (#1–#4, P0) |
| `61e8357` | Phase 4d–e — admin tier-label input + capabilities + design-system docs |
| `e52fb9a` | Phase 7 — Footer contact + social links via settings, constants deleted (#6, #7) |
| `4743fa7` | initial close-out (later extended by Phase 8 + Option 3) |
| `9e15e42` | Phase 8a — `REFERRAL_REWARD` const → settings; dead `ReferralCard.tsx` deleted (#18, P0) |
| `59d9b0e` | Phase 8b — delivery fee threaded through `AppSettings.deliveryFee` (#19, P0) |
| `3c3d6bd` | Phase 8c — dead `SPEED_GUARANTEE` const removed (#20) |
| `25deb24` | Option 3 — eslint `no-restricted-imports` rule + `tests/audit-regression.test.ts` (`npm test`) + 3 catches on first run (#21) |
| `2a879ea` | Phase 8 doc backfill — capabilities (Referral codes, Free-delivery bar) + checkout.md Rule #11 |

**What the audit achieved.** Every customer-visible surface that the operator can change through `/admin/*` now reflects that change without a deploy. The silent-drift class of bug — two sources of truth disagreeing — is gone in the audited domains (loyalty, locations, contact, fiscal, menu overrides, currency display). All theme/design-system docs touched were brought into sync (Rule #11). The capabilities ledger was refreshed where a capability's state changed (Rule #9).

**What was intentionally not changed.** Menu seed (`src/data/menus/*`) stays code per Q1; brand/theme stays code per Q4; the `getActiveLocations()` sync seed remains the right source for client surfaces while server paths use `getActiveLocationsAsync()` per the seed file's own contract; inline illustration SVG hex colours stay code (theme).

**What's left.** Localisation of customer-facing strings (#12, #14) and any CMS-driven nav (#13). Both are separate initiatives, not silent-drift bugs. When the i18n adoption begins, the existing `src/lib/i18n.ts` scaffolding + the 68 already-staged keys are the entry point.

**Verification.** Every commit shipped with `npx tsc --noEmit` reporting zero errors. End-to-end data flow was confirmed per Rule #8 for each fix (admin edit → store → API → consumer → user-visible change).
