# public/mockups

Static HTML design mockups served on every deploy at `/mockups/*`. Each
mockup is pure HTML + inline CSS (some pull Google Fonts via `@import`,
which the relaxed `/mockups/*` CSP in `next.config.ts` permits) — no JS
framework, no build step. What you see in the browser is exactly what
would ship.

These are linked from audit + design docs in `docs/` and used as
reference when reviewing redesigns in real browsers.

## Layout

| Path | Purpose |
|---|---|
| `cart.html` | Cart + checkout redesign concepts — V7 (animated), V8 (trattoria), V9 (editorial). Built-in tab switcher; each version is a self-contained iframe. |
| `kds/` | Kitchen Display System redesign — four finalist directions (Marquee, Dual Expo, Operations, Atlas), browsable from `index.html`. Each carries the capacity-vs-demand "Pace" layer (per-station pace gauges, incoming-load forecast, covers/hr + revenue/hr, a violet pre-breach capacity meter), plus fullscreen and an All / New / In progress / Ready · Expo lines switcher. |
| `pos/` | Point-of-Sale (cashier order-entry) — the chosen direction, **Tabs** (manage multiple concurrent open checks), browsable from `index.html`. Selected from ten explored concepts; reuses the KDS visual language and runs end to end (tap to ring up, combo discounts, charge flow) over the real Kraków menu in złoty. |
| `agent/` | Agent Commerce — the chosen direction, **Concierge** (one capability layer exposed over MCP **and** WhatsApp), browsable from `index.html`. The bet that AI assistants (ChatGPT/Claude/Perplexity) + WhatsApp become the ordering layer, so the restaurant exposes structured menu / availability / allergens / ordering / payments once and serves both. Reuses the Atlas chrome with the violet AI accent; runs end to end (toggle MCP capabilities, inspect each tool's JSON + an EU-14 allergen matrix, then switch to a live WhatsApp pre-order chat that calls the same tools) over the real Kraków menu in złoty. |
| `core-suite/` | **Unified Core Suite redesign** (current direction) — POS, KDS, and a merged Guest Engagement hub (CRM + Concierge + WhatsApp) on one shared design system: burgundy signature, champagne-platinum metallic, warm-neutral dark, Fraunces display + Inter UI. Browse from `index.html`; shares `system.css` across all three modules. This is the visual target for the live React implementation (see `docs/design-system/`). |
| `crm/` | Customer Relationship Management — the chosen direction, **Regulars** (searchable customer book beside a deep relationship profile), browsable from `index.html`. The system of record for *every* customer who leaves data (phone / takeout / delivery / email-receipt), not only loyalty members. **Passive identity** — a WhatsApp/voice pre-order agent captures guests with no sign-up, and each profile is a merged guest graph (phone, WhatsApp, recognised card, web device, email) with a confidence score + duplicate-merge. The book **splits into Agentic customers** (WhatsApp/Voice/Web) **vs Customers** (staff channels), with **channel** (Dine-in/Takeout/Delivery/WhatsApp/Voice/Web) and **time** as first-class, colour-coded filters + chips on every guest. Profiles carry a **WhatsApp conversation history** (past chats stacked, each with a Preview popup + an Open-in-WhatsApp handoff to the agent-commerce tab) and a **loyalty brief**. Reuses the POS + KDS visual language; runs end to end (search, lifecycle/data-facet/channel/time filters, sort, a redesigned relationship-health gauge with reliability + no-show warnings, AI next-best-action, invite-to-loyalty, points, consent, notes) over a 12-customer sample book in złoty. |
| `mobile/` | Mobile admin redesign — clickable screen mockups (see `docs/design-system/mobile/`) |
| `bundle-ladders/` | 10 alternative layouts for the bundle-ladder admin page |
| `menu-engineering.html` | Menu-engineering customer-facing redesign |
| `cart-upsell.html` | Cart upsell pattern exploration |
| `cross-sell-psychology.html` | Cross-sell suggestion behaviour |

> **Note:** `public/mockups/` is for *served* preview artifacts —
> browser-loadable design mockups referenced from `docs/`. Throwaway
> drafts, wireframes and design R&D that should **not** ship belong in
> the top-level `/tests/` directory instead (see `tests/README.md`).

## Browsing

- Locally: `npm run dev` → `http://localhost:3000/mockups/<path>`
- On any deploy: `/mockups/<path>`

Each subdirectory with multiple files has its own `index.html`.
