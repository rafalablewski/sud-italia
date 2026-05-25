# public/mockups/pos

Point-of-Sale (cashier order-entry) design directions, served on every
deploy at `/mockups/pos/`. The companion to the KDS gallery in `../kds/` —
every direction deliberately reuses the **KDS visual language** (Inter +
JetBrains Mono, the shared dark/light canvases, the tone palette and the
header/footer chrome) so POS and KDS read as one system.

Each file is pure, self-contained HTML + inline CSS + inline JS — no build
step, no framework. The only external resource is the Google Fonts link
(permitted by the relaxed `/mockups/*` CSP in `next.config.ts`). What you
see in the browser is exactly what would ship.

All ten share the same sample menu (the real Kraków SKUs and prices, in
złoty), the same three combo deals, and the same loyalty rule (1 pt per
1 zł). The data is hardcoded in each file — these are design concepts, not
wired to the app.

## Browsing

- Locally: `npm run dev` → `http://localhost:3000/mockups/pos/`
- On any deploy: `/mockups/pos/`

Start at `index.html` — it previews and links all ten.

## The ten directions

| # | File | Direction |
|---|---|---|
| 01 | `01-counter.html`  | **Counter** — light · classic two-pane touch register (the safe default) |
| 02 | `02-register.html` | **Register** — slate · register with a numeric cash keypad + change due |
| 03 | `03-terminal.html` | **Terminal** — dark · keyboard-first command terminal (type to add, hotkeys) |
| 04 | `04-tiles.html`    | **Tiles** — dark · kiosk-grade oversized product tiles |
| 05 | `05-express.html`  | **Express** — light · quick-service favourites + one-tap combos, speed timer |
| 06 | `06-tabs.html`     | **Tabs** — dark · multiple concurrent open checks |
| 07 | `07-flow.html`     | **Flow** — slate · guided Items → Customer → Pay → Done wizard |
| 08 | `08-split.html`    | **Split** — dark · bill-splitting across guests + multi-tender |
| 09 | `09-pad.html`      | **Pad** — slate · portrait handheld / line-buster |
| 10 | `10-loyalty.html`  | **Loyalty** — light · customer-identity-first, rewards at the till |

> **Note:** like `../kds/`, these are *served* preview artifacts referenced
> from design reviews. Throwaway drafts and R&D that should **not** ship
> belong in the top-level `/tests/` directory instead (see `tests/README.md`).
