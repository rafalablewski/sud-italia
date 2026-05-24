# Sud Italia

Neapolitan pizza-truck chain ordering platform. Two active locations:
**Kraków** and **Warszawa**. Customer ordering, admin operations, kitchen
display, and a mobile-native admin shell — all in one Next.js app on
serverless infrastructure.

## Stack

- **Next.js 16** + **React 19** (App Router, Server Components)
- **TypeScript 5**, **Tailwind CSS 4**
- **Zustand** for client state (cart, customer identity)
- **Stripe** for payments
- **Neon Postgres** for persistence (filesystem fallback in local dev)
- **Drizzle ORM** for migrations + typed access
- **Upstash Redis** for distributed locks, rate limits, cart presence
- **Web Push** + **Service Worker** for PWA + admin notifications
- **Anthropic SDK** for the in-admin ops agent
- **Sentry** for error monitoring
- Deployed on **Vercel**

## Quick start

```bash
cp .env.local.example .env.local   # fill in what you need
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The site runs in
demo mode without Stripe / Neon / Redis — every integration is
flag-gated and the filesystem store kicks in when `DATABASE_URL` is
unset.

`ADMIN_PASSWORD` is required to log into `/admin`. See
`.env.local.example` for the full list of optional integrations
(Twilio, Mailgun, Anthropic, VAPID push, aggregators, etc).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build (Next compile + route validation) |
| `npm start` | Run the production build |
| `npm run lint` | ESLint (`src/**/*.{ts,tsx}`) |
| `npm run db:generate` | Generate a Drizzle migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run chaos` | Phase-0 chaos harness (`scripts/chaos-phase0.ts`) |

One-shot verification harnesses (not part of CI) live in
`scripts/legacy/` — see that folder's README.

## Repo layout

```
.
├── src/
│   ├── app/              Next.js App Router routes
│   │   ├── (public)/     Customer-facing storefront
│   │   ├── admin/        Operator admin (30+ pages)
│   │   ├── api/          Route handlers
│   │   ├── corporate/    B2B corporate orders
│   │   ├── franchisee/   Franchisee dashboard
│   │   ├── kitchen/      Kitchen Display System (KDS)
│   │   └── r/            Short-link redirects
│   ├── components/       UI by domain (admin, cart, kitchen, …)
│   ├── data/             Static data (menus, locations, types)
│   ├── db/               Drizzle schema + client + migrate runner
│   ├── lib/              Business logic (store, auth, growth, AI, …)
│   └── store/            Zustand client stores
├── migrations/           Drizzle SQL + metadata (do not hand-edit)
├── docs/                 Design + audit documents — see docs/README.md
├── tests/                Non-shipping drafts, sketches + design R&D — see tests/README.md
├── public/
│   ├── mockups/          Served HTML design mockups — see public/mockups/README.md
│   ├── sw.js             Service worker
│   └── manifest.json     PWA manifest
├── scripts/
│   ├── chaos-phase0.ts   Chaos harness (npm run chaos)
│   └── legacy/           One-shot verification harnesses
├── AGENTS.md             Agent-facing project pointers
├── CLAUDE.md             Critical project rules — read before editing
├── next.config.ts
├── drizzle.config.ts
└── vercel.json           Cron + route config
```

## Project rules

Before changing code, read **`CLAUDE.md`**. The non-negotiables:

1. No mock / fake / hardcoded data — every feature wires to real sources.
2. No raw `fs` — use `readJSON`/`writeJSON` in `src/lib/store.ts` so
   prod (Neon) and local (filesystem) both work.
3. Never import server-side modules in `"use client"` components.
4. Modals + overlays must use `createPortal(modal, document.body)`.
5. Surface every new capability on `/admin/capabilities` in the same
   commit — it's the source of truth for what's deployed.

## Architecture pointers

- **Data persistence:** all reads/writes go through
  `readJSON`/`writeJSON` in `src/lib/store.ts`. Concurrency-sensitive
  paths use `withLock`.
- **Settings:** `getLoyaltySettings()` / `updateLoyaltySettings()`;
  public-facing settings served via `/api/settings/public`.
- **Admin auth:** cookie sessions in `src/lib/admin-auth.ts`. Every
  admin API route must call `isAuthenticated()`.
- **Menu data:** authored in `src/data/menus/{krakow,warszawa}.ts` with
  runtime overrides via `getMenuWithOverrides()`.
- **Customer identity:** cookie `sud-italia-customer`, set at checkout,
  read by `/api/customer/identify`.
- **Mobile admin:** activates automatically below 900px. Mobile views
  live under `src/components/admin/v2/mobile/` and
  `src/components/admin/mobile/`. See `docs/mobile/`.

## Deployment

Deploys to Vercel from `main`. CI (`.github/workflows/ci.yml`) runs
`tsc --noEmit`, `eslint`, and `next build` on every PR — the build step
catches Next-specific issues (server-only imports in client components,
route validation) that tsc + lint miss.
