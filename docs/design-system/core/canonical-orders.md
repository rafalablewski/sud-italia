# Canonical orders — the demo data

← back to [README](./README.md)

Every mockup shares one ledger so the same order tells the same story
across **POS, KDS (Fleet + Floor + Chef), and the Guest Engagement hub**.
This page is the ledger. Update it here first, then propagate.

> **Rule of thumb:** one order = one number, one cart, one total, one
> guest record — across every surface.

## The cast

Two trucks. A handful of in-flight orders that exercise every state the
system has.

### Kraków

| # | Channel | Table / route | Guest | State | Items | Total | Promise |
|---|---|---|---|---|---|---|---|
| **#4820** | Dine-in | T2 (2 cov.) | walk-in | Coursed · starters fired · mains held | 2× bruschetta · 1× Margherita | 89 zł | ~12m |
| **#4821** | Dine-in | T7 (4 cov.) | **Lucia Bianchi** (Gold · 28 visits) | Coursed · mains firing | 2× burrata · 2× Marinara · 2× Bufala · 1× Famiglia tiramisù · 2× espresso | **281 zł** (9 items) | **~14m** |
| **#4822** | Delivery | Kazimierz | David K | Firing | 1× Diavola · 1× Cesare · 1× tiramisù | 142 zł | ~17m (over) |
| **#4823** | Dine-in | T9 (6 cov.) | **Famiglia Conti** | **All together** · firing | 2× antipasto misto · 2× pasta · 2× pizza · 1× tiramisù · 4× drinks | 412 zł | ~22m |
| **#4824** | Takeaway | counter | Marek | Ready · pass | 1× Marinara · 1× san pellegrino | 47 zł | done |
| **#4825** | Dine-in | T5 (3 cov.) | new | Coursed · starters firing | 1× burrata · 2× bruschetta | 64 zł | ~9m |

### Warszawa

| # | Channel | Table / route | Guest | State | Items | Total | Promise |
|---|---|---|---|---|---|---|---|
| #4816 | Dine-in | T3 (2 cov.) | Anna W | Firing | 1× Margherita · 1× espresso | 52 zł | ~10m |
| #4817 | Delivery | Powiśle | Mateusz | Late · ~4m over | 2× Diavola · 1× Cesare | 134 zł | over |
| #4818 | Takeaway | counter | walk-in | Ready · pass | 1× Bufala | 49 zł | done |

## The hero order — #4821 (T7, Lucia)

This is the one that appears on every screen. Treat its numbers as
holy.

- **Phone:** `+48 600 ··· 142`
- **Tier:** Gold (28 visits, LTV `2 740 zł`, avg `~98 zł`)
- **Cart:** 9 items · **281 zł** · 4 covers
- **Coursing:** Coursed
  - **Starters** — 2× burrata (fired 19:44)
  - **Mains** — 2× Marinara + 2× Bufala (**firing now** — promise ~14m)
  - **Dessert** — 1× Famiglia tiramisù + 2× espresso (held)
- **Slot:** 20:00
- **Pending payment:** Stripe link sent at 19:55, status `awaiting pay`
- **Guest hub note:** *"Anniversary last year — banquette T7 was the table"*

Where #4821 appears:

| Surface | Reads as |
|---|---|
| POS — active check tab | `T7 · 4 cov · 281 zł · Mains firing` |
| KDS Floor — firing lane | `#4821 · T7 · 2 · Mains · ~14m promise · Allergens: milk` |
| KDS Fleet — Kraków card | counted in `Firing · 6` and `On time · 92%` |
| WhatsApp inbox — Lucia | thread highlighted `live` · awaiting pay strip |
| WhatsApp transcript right pane | live order block + funnel checklist (Pay step open) |
| Guest CRM profile | last order = #4821 in *Recent orders* |
| Concierge `place_order` example | response payload shows #4821 |

If you change a field on #4821, change it on **all** of those.

## The all-together order — #4823 (T9, Famiglia Conti)

The counterpoint to #4821 — a 6-cover dine-in that explicitly opted
out of coursing. Used to demonstrate the **`All together`** platinum
chip on the KDS ticket and the *"Fire whole table at once · no holds"*
hint line.

- 2× antipasto misto · 2× tagliatelle bolognese · 2× Margherita · 1×
  tiramisù · 2× san pellegrino · 2× espresso
- One ticket, all course groups visible (Starters / Mains / Dessert)
- POS Kitchen-timing toggle reads `All together`

## The late order — #4817 (Powiśle delivery)

The board's worst-current example. Used to show:

- `--late` red left accent + inset 1px outline glow (no blur halo)
- Footer ETA label `Over promise · ~4 min` in red
- Fleet card escalates the location's `On time` percentage downward

## The ready order — #4824 (Kraków takeaway counter)

Used to show:

- De-emphasised treatment (`opacity: .9`)
- Footer label `Ready for expo`
- Pass-side waiting state (no operator action needed)

## Cross-surface invariants

These are the things that **must** match across mockups + live code:

1. **One id everywhere.** #4821 is #4821 on POS, KDS, Guest hub, and any
   Concierge sample payload — never re-used for a different cart.
2. **Cart totals match the line items.** `281 zł = 9 items`. Don't ever
   write `212 zł · 4 items` on one screen and `281 zł · 9 items` on
   another — the user will notice.
3. **Channel matches table assignment.** Dine-in implies a table tag,
   delivery implies an address, takeaway implies neither.
4. **Promise time matches the model.** A ticket's footer ETA + the
   category chip on POS + the Fleet pace gauge all read from the
   same `analyzeTruck` output.
5. **Concierge sample payloads are computed, not canned.** When the
   `Test live` button is hit on `get_menu` it should respond with the
   actual current Kraków menu — including #4821's mains.

## Updating the ledger

When you add a demo order or change one:

1. Edit this table first.
2. Search the mockups for the order number (`grep -r "#4821"
   public/mockups/core-suite/`) and update every reference.
3. Search live code (`grep -r "4821" src/`) if a story exists in the
   admin demos.
4. Re-screenshot the affected modules so the README launcher reflects
   the new state.

The discipline here is the difference between a polished surface and a
prop set that contradicts itself on close inspection.
