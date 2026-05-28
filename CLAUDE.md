@AGENTS.md

## Project Overview

Sud Italia — Neapolitan pizza truck chain ordering platform (Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, Stripe, Neon Postgres).

Two active locations: Kraków, Warszawa. Serverless deployment.

## Critical Rules

1. **NEVER use hardcoded/mock/fake data.** Wire every feature to real data sources (database via `src/lib/store.ts`, API calls). Cosmetic-only implementations are unacceptable — every feature must actually function end-to-end. No `MOCK_MEMBERS`, no `EARNED_IDS = new Set(["first-order"])`, no `const FAKE_DATA = [...]`.

2. **Serverless deployment — NEVER use raw `fs` operations.** Always use the app's `readJSON`/`writeJSON` store utilities in `src/lib/store.ts` which handle both Neon Postgres (when `DATABASE_URL` is set) and filesystem fallback (local dev). Never write `readFile`/`writeFile` with `process.cwd()` in new code.

3. **Never import server-side modules in `"use client"` components.** Functions that use Node.js APIs (`fs`, `crypto`), `@neondatabase/serverless`, or `next/headers` cannot be imported in client components. If you need data in a client component, fetch it from an API route.

4. **All modals and overlays MUST use `createPortal(modal, document.body)`.** The admin layout's `.admin-bg > *` rule sets `position: relative; z-index: 1` on all children, which creates stacking contexts that trap fixed-position elements. Never rely on z-index alone.

5. **Place new user-facing features in prominent, discoverable locations.** Loyalty/rewards go in the navigation and get a dedicated page. New sections go above the fold or near the top — never buried below 20 menu items. Always consider: "Will the user actually find this?"

6. **Zero-friction ordering.** No registration walls. No account creation. No passwords. Phone-based auto-enrollment for loyalty. Email collection is always optional. Minimize steps to order.

7. **Toggles and buttons must persist immediately.** When a toggle switches on/off, it must call `saveSettings()` to persist to the database right away — not just update local React state. No separate "Save" button needed for toggles. Users expect toggle = saved.

8. **Verify full data flow end-to-end before committing.** When building a feature that connects components (cross-sell → cart, discount → total, points → display), trace the entire chain: props passed → handlers wired → state updated → DB persisted → result visible to user. If any link is broken, the feature is broken.

9. **Register every new capability in `/admin/capabilities`.** Whenever you ship a new feature, integration, scheduled job, or admin page, add a corresponding entry to `src/app/admin/capabilities/page.tsx` in the same commit. Include: `name`, one-sentence `summary` (what it does + how to use), `href` to the primary admin/customer surface, `envVars` if it needs configuration, and a `status` that introspects from `process.env` (`live` / `needs-config` / `disabled`) using the existing `has(...keys)` helper. The page is the source of truth for "what's deployed" — a feature that isn't listed there is invisible to operators.

10. **Recipes & ingredients are chain-wide, never per-location. Same recipe across every location = consistency = clients coming back.** A dish has exactly ONE recipe, keyed by its base slug (`getBaseSlug()` strips the `krk-`/`waw-` prefix, so `krk-pizza-margherita` and `waw-pizza-margherita` share one `pizza-margherita` recipe). The store derives the base slug on read+write (`getRecipe`/`saveRecipe` in `src/lib/store.ts`); ingredients are a single shared catalog. The admin Recipes board (`AdminRecipes.tsx`) shows **one card per dish** — it pulls every location's menu and dedupes by base slug, so there is **no location switch**; per-location price/margin appear as chips on the card and dishes that aren't on every menu get an "X only" tag. The recipe editor writes the formula once (chain-wide) and pushes product metadata (name, description, dietary facts, allergens) to **every** location that lists the dish, so those stay identical too. Only the **listed price** varies per location — never expose a per-location recipe/ingredient selector, and never fork a recipe or ingredient per location. A Margherita in Kraków must taste identical to one in Warszawa.

11. **Design-system docs ship with the code.** Every mutation — **add, edit, write, delete, rename** — to theme code (CSS under `src/app/themes/{admin,core,homepage}/`, plus the components, pages, and primitives each theme owns per its `docs/design-system/<theme>/README.md`) lands in the same commit as the matching doc edit under `docs/design-system/<theme>/`. Code wins over docs — if they disagree after your change, fix the doc; don't ship the drift. Same discipline as Rule #9, applied to the design system instead of the capabilities ledger. Two failure modes to name explicitly: **delete** leaves orphan rows in the doc tables — grep `docs/design-system/` and remove them; **rename** leaves stale path pointers ("Live code:" lines, file-path references in section/module/page docs) — grep for the old path and update every hit. The theme's `theme/extend.md` is the contract for *how* to add tokens, variants, pages, or icons — read it before inventing a new pattern. `docs/audits/*` are dated historical snapshots and are **never** edited retroactively. When a change is operationally pure (bug fix in a handler, perf tweak, internal refactor with no design-system surface change) the rule doesn't fire — but when in doubt, update the doc.

## Architecture

- **Store:** `src/lib/store.ts` — all data persistence goes through `readJSON`/`writeJSON` (handles Postgres + filesystem). Add new data types here with `withLock` for concurrency safety.
- **Client state:** Zustand store at `src/store/cart.ts` for cart, `src/store/customer.tsx` for customer identity (React context + cookie).
- **Settings:** `src/lib/store.ts` → `getLoyaltySettings()`/`updateLoyaltySettings()` for all growth/loyalty config. Public-facing settings served via `/api/settings/public`.
- **Admin auth:** Cookie-based sessions via `src/lib/admin-auth.ts`. All admin API routes must call `isAuthenticated()`.
- **Menu data:** Hardcoded in `src/data/menus/krakow.ts` and `warszawa.ts`, with runtime overrides via `getMenuWithOverrides()`.

## Admin Pages

Dashboard, Orders, KDS, Menu, Recipes, Slots, Inventory, Suppliers, Purchase orders, Staff, Schedule, Customers, Loyalty, Feedback, Reports, Cash, Growth, Upsell, Truck, Locations, AI, Expansion, Users, Compliance, Audit log, Capabilities, Settings — all at `/admin/*`. Use the v2 `AdminShell` (nav config in `src/components/admin/v2/nav.config.ts`). Use glassmorphism design system (glass-card, glass-input, glass-btn, admin-text classes). The Capabilities page at `/admin/capabilities` is the source of truth for what's deployed — see Rule #9.

## Where Draft Sketches and Test Artifacts Go

All draft sketches, wireframes and design R&D belong in `/tests/`.

- New sketches → `/tests/sketches/<descriptive-name>.html`
- Standalone exploratory pages (logo concepts, palette tests, competitor comparisons) → top of `/tests/`
- Never put drafts in `public/assets/` (it ships) or `src/` (it ships). Keep `/tests/` out of the deployed bundle.

See `/tests/README.md` for the full convention and current contents.

## Key Patterns

- Cross-sell suggestions: `src/lib/upsell.ts` → `getCartSuggestions()`. Always suggest espresso + dessert with pizza/pasta.
- Combo deals: `getActiveComboDeals()` — discount must be subtracted from actual cart total, not just displayed.
- Customer identity: Cookie `sud-italia-customer` set at checkout, read by `/api/customer/identify`.
- Seasonal items: Stored in loyalty settings, filtered by `locationSlug`. Fetched via `/api/settings/public?location=`.
- Points: Order-based (1 pt per PLN) + manual admin adjustments via `getManualPointsTotal()`. Both must be summed.
