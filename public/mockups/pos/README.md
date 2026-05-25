# public/mockups/pos

Point-of-Sale (cashier order-entry) direction, served on every deploy at
`/mockups/pos/`. The companion to the KDS gallery in `../kds/` — it reuses
the **KDS visual language** (Inter + JetBrains Mono, the Atlas dark canvas,
the tone palette and the header/footer chrome) so POS and KDS read as one
system.

This started as ten explored directions (Counter, Register, Terminal,
Tiles, Express, Tabs, Flow, Split, Pad, Loyalty). **Tabs** was chosen, so
the rest were pruned — this folder now carries only the selected direction.

The file is pure, self-contained HTML + inline CSS + inline JS — no build
step, no framework. The only external resource is the Google Fonts link
(permitted by the relaxed `/mockups/*` CSP in `next.config.ts`). What you
see in the browser is exactly what would ship.

## The chosen direction

| # | File | Direction |
|---|---|---|
| 06 | `06-tabs.html` | **Tabs** — dark · manage multiple concurrent open checks at the window |

**Tabs** puts a rail of open checks front and centre — each its own running
total, item count and status (open / parked / ready to pay). You switch
between them, open new ones, park the current one, and send each to the KDS
independently, so a busy truck window can keep several orders in flight at
once without losing any. It runs end to end over the real Kraków menu in
złoty: tap to ring up, qty steppers, the Lunch-Combo discount, and a
charge → tender → paid flow per tab.

## Browsing

- Locally: `npm run dev` → `http://localhost:3000/mockups/pos/`
- On any deploy: `/mockups/pos/`

`index.html` is the landing for the chosen direction.

> **Note:** like `../kds/`, this is a *served* preview artifact referenced
> from design reviews. Next step is porting Tabs into
> `src/components/admin` for an `/admin/pos` surface.
