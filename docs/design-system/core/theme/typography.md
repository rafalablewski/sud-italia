# Core — Typography

← back to [Core README](../README.md)

Core splits by surface. **KDS** (the `.cmd-*` kitchen wall) is a pure
workhorse — **Inter + JetBrains Mono only**, no display serif: on the
line, density wins and ornament has no room. **POS and the Guest hub**
(the `.core-suite` surfaces ported from the mockup) **do** use the
**Fraunces** display serif, sparingly, for the focal numbers and names —
KPI values, dish names, guest names — exactly where the mockup leads
with type. Body, labels, buttons and data stay Inter / mono everywhere.

## The three faces

| Face                | Use on Core                                        |
| ------------------- | -------------------------------------------------- |
| **Inter**           | Every label, button, heading, body text. Workhorse — the default on every surface. |
| **JetBrains Mono**  | Code-like data: order IDs (`#4821`), prices, tab tokens, table-row numerals where alignment matters. |
| **Fraunces**        | Display only, `.core-suite` (POS / Guest) only: KPI values (`.stat .v`, `.kpi-value`), dish + guest names (`.prod h3`, `.gp .nm`, `.pf-name`). Never on KDS. |

Loaded via `next/font` in `src/app/admin/layout.tsx` as
`--font-admin-body` (Inter), `--font-admin-mono` (JetBrains Mono) and
`--font-admin-display` (Fraunces); `suite.css` maps these to its
`--ui` / `--mono` / `--display` vars.

## The weight ladder

| Weight | Inter use                                          | Example                           |
| ------ | -------------------------------------------------- | --------------------------------- |
| 400    | Body text, secondary captions                      | "queued · 2 min ago"              |
| 500    | UI labels, table cells, button text                | "Bump", "Park tab"                |
| 600    | Emphasised data, headings inside cards             | "Pizza Margherita", "Table 7"     |
| 700    | The numerals that operators read across the line   | Ticket ID `#4821`, tender total `87.40` |

**Don't reach for 800 or 900.** Past 700, Inter starts to read heavy
in the dark `--cmd-canvas` and the rhythm breaks.

JetBrains Mono uses 400 and 500 only — anything heavier reads as
hostile in a data column.

## The size ladder

Core's sizes are *tighter* than Admin's. The reasoning: operator
density wins.

| Token (informal) | Size  | Use                                              |
| ---------------- | ----- | ------------------------------------------------ |
| micro            | 10px  | Eyebrow labels (`.cmd-eyebrow-brand`, status chip uppercase). |
| caption          | 11–12px | Meta, secondary timestamps                     |
| body             | 13px  | The default. Ticket body, POS line items, CRM rows. |
| label            | 14px  | Card headings, primary buttons                   |
| h2               | 16–18px | Section headings inside a Core surface         |
| numeric-lg       | 22–26px | The big-read numerals — ticket id on the ticket card, tab total on the POS, count of active conversations on WhatsApp |
| numeric-xl       | 32–40px | The ONE number on the screen that has to be visible from 3m away (KDS expo board total, POS tender total). Used sparingly. |

The 13px default is intentional. It matches the **Atlas ported mockup
values** that the Core surfaces were tuned against, and it's the
density that lets a fleet of 8 tickets fit on a 13" screen without
horizontal scroll.

## The rules

1. **Tabular numerals everywhere a column aligns.** `font-variant-numeric:
   tabular-nums` on every numeric column (`.tabular` utility class).
   Without it, prices and counts drift across rows and the eye can't
   scan.
2. **Uppercase is reserved for the eyebrow row.** `.cmd-eyebrow-brand`,
   `.cmd-eyebrow-meta`, status chips at 10px / `letter-spacing: 0.08–0.16em`.
   Don't UPPERCASE body labels.
3. **No italic on Core.** Italic reads as "softer / suggested" in
   English type and on a kitchen station that misreads as "optional".
   Italic is reserved for Admin (where it's used in disclaimer copy)
   and Homepage (where it's used in editorial display).
4. **Line height stays at 1.4 for body, 1.2 for numerals.** Tighter
   than Admin's 1.5 default — the density rule again.
5. **One typographic accent per card maximum.** A ticket card uses
   weight 700 for the ID *and* the timer countdown — that's two
   accents on one card, which is the cap. Adding a third (the
   customer name in bold? the action in heavy?) flattens the
   hierarchy.

## The numeral specifics that matter

Three numerals carry the most operator weight in Core, and they all
get a deliberate treatment:

- **The ticket ID** on KDS — `#4821`. Inter 700, 22px, tabular,
  always prefixed with `#`. The same number appears on the POS tab,
  the guest order hub, the receipt — one order, one number (CLAUDE
  rule 8 / canonical-orders).
- **The tender total** on POS — `87.40 zł`. Inter 700, 26px on the
  tender pad, tabular, currency suffix at 14px not in italic. Never
  prefix-currency (we're a Polish-first surface, `zł` follows the
  number).
- **The pace timer** on KDS — `02:14`. JetBrains Mono 500, 22px,
  tabular, colour shifts through `--cmd-firing` → `--cmd-warn` →
  `--cmd-late` as it crosses SLA boundaries.

These three are the read-across-the-room numerals. Everything else
defers.

## What this typography is not

- It is **not** the Admin scale. Admin uses bigger sizes (the default
  text size in `[data-admin-theme]` is 14px, not 13px) because the
  back-office isn't reading from 3m away.
- It is **not** the Homepage scale. Homepage uses Fraunces for hero
  type and the brand wordmark — Core uses Inter for both.
- It is **not** customisable per module. A KDS ticket card and a POS
  line item read at the same body size for a reason — the operator's
  eye doesn't have to re-calibrate when they move between modules.

Core typography is the **read-across-the-line system** — every weight,
size, and rule serves the operator's first read.
