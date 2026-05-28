# Homepage — Typography

← back to [Homepage README](../README.md)

The storefront is the **one place Fraunces leads**. On Admin, Fraunces
is a quiet display option; on Core, Fraunces never appears. On
Homepage, the editorial serif carries the brand voice and Inter
supports.

## The three faces

| Face                | Use on Homepage                                          |
| ------------------- | -------------------------------------------------------- |
| **Fraunces**        | Hero headlines, section titles, menu item names, the wordmark, pull-quotes, tier badges. The "hospitality soul" of the brand. |
| **Inter**           | Body copy, navigation, buttons, form inputs, table cells, price callouts, captions. The workhorse. |
| **JetBrains Mono**  | Order numbers (`#4821`), referral codes, anything that needs to be unmistakeably a code. Rare on the storefront. |

Loaded once at the project root via `next/font` in `src/app/layout.tsx`
as `--font-fraunces`, `--font-inter`, `--font-jetbrains` and consumed
through the Tailwind tokens `--font-heading` / `--font-body`.

## The weight ladder

| Weight | Fraunces use                                          | Inter use                                              |
| ------ | ----------------------------------------------------- | ------------------------------------------------------ |
| 400    | (rare — Fraunces 400 reads thin in display)           | Body paragraphs, captions                              |
| 500    | Default Fraunces weight: section titles, item names   | UI labels, table cells                                 |
| 600    | Display headings (only on the hero + About section)   | Emphasised body, button text                           |
| 700    | (avoid — too heavy in cream-on-dark contexts)         | Price callouts, the loyalty balance numeral, headlines that compete with imagery |

**The discipline:** Fraunces 600 only on the Hero + About pull-quote.
Section titles use Fraunces 500. Item names use Fraunces 500. Anything
heavier in Fraunces reads as ad copy and breaks the editorial frame.

JetBrains Mono uses 500 only — rare appearances on order numbers, the
referral code, the points balance on the rewards card (when tabular
alignment is essential).

## The size ladder

Homepage sizes are *generous* — bigger than Core's 13px default
because the guest is reading at a normal phone distance, not
across-the-line.

| Token (informal) | Size  | Use                                                                        |
| ---------------- | ----- | -------------------------------------------------------------------------- |
| caption          | 12px  | Footer copy, fine print, the "We'll only use this for the receipt" reassurance |
| body-sm          | 14px  | `.pub-input` fields, secondary copy                                        |
| body             | 16px  | The default body text size — paragraphs in About, item descriptions        |
| label            | 18px  | Section headings inside cards (e.g. on `LoyaltyCard`)                      |
| h3               | 20px  | Sub-section headings on the landing                                        |
| h2               | 24–30px | Section titles (Fraunces 500/600)                                        |
| h1               | 36–48px | Page titles (Fraunces 600), the rewards page headline                    |
| display          | 48–72px | The hero headline — Fraunces 600, with line-height 1.1                   |

## The rules

1. **Display copy uses Fraunces; everything else uses Inter.** A 24px
   body paragraph in Fraunces reads as decoration. A 36px hero
   headline in Inter reads as commodity. Hold the line.
2. **Line-height ladder:**
   - Display (h1, hero): 1.1
   - Headings (h2, h3): 1.25
   - Body: 1.5
   - Buttons + UI labels: 1
3. **Tabular numerals on every aligned price column** — same rule as
   Core. Without `font-variant-numeric: tabular-nums`, item prices
   on a list drift across rows.
4. **No italic on the storefront body.** Italic is reserved for the
   single Fraunces pull-quote on About (display italic, hospitality
   editorial). Body italic reads as soft / suggested in English and
   doesn't land well in Polish either.
5. **Sentence case for headings** — "Find your nearest truck", not
   "Find Your Nearest Truck". Title case in Fraunces reads as
   theatrical; we want welcoming.
6. **Uppercase only for the smallest meta** — the eyebrow line above
   a section title, the "New" chip on an item card. 10–11px,
   `letter-spacing: 0.08em`.

## The hero specifics

The hero headline is the loudest piece of typography on the storefront
and gets a specific treatment:

- Fraunces 600 at the display range (48–72px depending on viewport).
- Tight `letter-spacing` (`-0.02em`) — display Fraunces reads better
  slightly condensed.
- Line-height 1.1 — display always tighter than body.
- A maximum of 8 words. If the headline needs more, it's two
  headlines.

## The price callout specifics

Prices on item cards + the cart drawer + the rewards page get a
deliberate treatment:

- Inter 700, 18–22px (size varies by surface: 18px in item cards,
  22px in cart-line items, 26px on the tender total in checkout).
- Tabular numerals.
- Currency suffix at 14px, NOT italic, no extra weight — `87.40 zł`.
- Never prefix-currency (Polish convention is suffix; even on the
  EUR / USD display modes, the suffix convention holds).

## What this typography is not

- It is **not** the Admin type scale. Admin's default is 14px Inter;
  Homepage's default is 16px Inter. The storefront has more
  breathing room.
- It is **not** the Core type scale. Core uses 13px workhorse-tight;
  Homepage uses 16px guest-comfort.
- It is **not** Fraunces everywhere. Over-using the display serif
  flattens the hierarchy — Fraunces is the brand voice, not the
  voice. Inter does the work.

The Homepage type system is **brand voice (Fraunces) + workhorse
(Inter) + tabular precision (Mono)** — three faces, each in its
place, the editorial serif leading because this is the brand
surface.
