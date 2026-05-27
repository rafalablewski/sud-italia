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

10. **Recipes & ingredients are chain-wide, never per-location. Same recipe across every location = consistency = clients coming back.** A dish has exactly ONE recipe, keyed by its base slug (`getBaseSlug()` strips the `krk-`/`waw-` prefix, so `krk-pizza-margherita` and `waw-pizza-margherita` share one `pizza-margherita` recipe). The store derives the base slug on read+write (`getRecipe`/`saveRecipe` in `src/lib/store.ts`); ingredients are a single shared catalog. The admin Recipes board groups cards by per-location menu items (menu items ARE per-location), so a dish appears once per city — but every card resolves to the same recipe row via `recipeByBaseSlug.get(getBaseSlug(item.id))`, and editing one edits the shared formula. Only the **listed price** varies per location. Never fork a recipe or ingredient per location — a Margherita in Kraków must taste identical to one in Warszawa.

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
