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
| `crm/` | Customer Relationship Management — the chosen direction, **Regulars** (searchable customer book beside a deep relationship profile), browsable from `index.html`. The system of record for *every* customer who leaves data (phone / takeout / delivery / email-receipt), not only loyalty members. **Passive identity** — a WhatsApp/voice pre-order agent captures guests with no sign-up, and each profile is a merged guest graph (phone, WhatsApp, recognised card, web device, email) with a confidence score + duplicate-merge; a Book ↔ Agent-intake view toggle shows the live capture stream. Reuses the POS + KDS visual language; runs end to end (search, data-facet segments, sort, a redesigned relationship-health gauge with reliability + no-show warnings, AI next-best-action, invite-to-loyalty, points, consent, notes) over a 12-customer sample book in złoty. |
| `mobile/` | Mobile admin redesign — clickable screen mockups (see `docs/mobile/`) |
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
