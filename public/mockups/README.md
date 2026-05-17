# public/mockups

Static HTML design mockups served on every deploy at `/mockups/*`. Each
mockup is pure HTML + inline CSS (no JS framework, no build step) so
what you see in the browser is exactly what would ship.

These are linked from audit + design docs in `docs/` and used as
reference when reviewing redesigns in real browsers.

## Layout

| Path | Purpose |
|---|---|
| `mobile/` | Mobile admin redesign — clickable screen mockups (see `docs/mobile/`) |
| `bundle-ladders/` | 10 alternative layouts for the bundle-ladder admin page |
| `cart-upsell-mockup.html` | Cart upsell pattern exploration |
| `cross-sell-psychology-mockup.html` | Cross-sell suggestion behaviour |
| `menu-engineering.html` | Menu-engineering customer-facing redesign |

## Browsing

- Locally: `npm run dev` → `http://localhost:3000/mockups/<path>`
- On any deploy: `/mockups/<path>`

Each subdirectory with multiple files has its own `index.html`.
