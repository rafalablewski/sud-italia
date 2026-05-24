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
| `kds/` | Kitchen Display System redesign — 10 distinct design directions (Graphite, Bianco, Console, Timeline, Marquee, Heat Grid, Dual Expo, Tap Stack, Editoriale, Operations) as separate live files, browsable from `index.html`. The earlier single-file theme switcher is preserved as `legacy-theme-switcher.html`. |
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
