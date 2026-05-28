# Homepage — Typography

← back to [Homepage README](../README.md)

The storefront is the **one place a display serif leads**. On Admin,
Cormorant is absent; on Core, never. On Homepage, **Cormorant Garamond**
carries the brand voice and **Lora** supports — the V8 Trattoria
editorial-serif duo, matching the mockup at `public/mockups/cart.html`.

## The three faces

| Face                    | Use on Homepage                                          |
| ----------------------- | -------------------------------------------------------- |
| **Cormorant Garamond**  | Hero headlines, section titles, menu item names, the wordmark, pull-quotes, tier badges, the `.it` Italian-phrase italic. The "hospitality soul" of the brand. |
| **Lora**                | Body copy, navigation, buttons, form inputs, table cells, price callouts, captions. The workhorse — Lora is a humanist serif, not a sans, because parchment + sans reads as a billboard. |
| **JetBrains Mono**      | Order numbers (`#4821`), referral codes, anything that needs to be unmistakeably a code. Rare on the storefront. |

Loaded via `next/font` in `src/app/(public)/layout.tsx` as
`--font-homepage-heading` (Cormorant Garamond) + `--font-homepage-body`
(Lora) and consumed through the Tailwind tokens `--font-heading` /
`--font-body` declared in `themes/homepage/tokens.css`. Storefront
fonts are isolated to the `(public)` route group — admin and core
load their own faces and a Cormorant weight change here can't drift
into them.

Fallback stack:
- Heading: `Cormorant Garamond → Playfair Display → Georgia → Times New Roman → serif`
- Body: `Lora → Georgia → Times New Roman → serif`

Both stacks stay all-serif. Falling back to a sans would jar the
parchment-and-paper canvas.

### The scope subtlety — why fonts are injected on `:root`

next/font's `.variable` class — the one we apply on the wrapping
`<div>` in `(public)/layout.tsx` — only sets `--font-homepage-body`
(and `-heading`) *on that element*. Tailwind's `@theme inline` block
in `themes/homepage/tokens.css` declares:

```css
--font-body: var(--font-homepage-body, "Lora"), Georgia, "Times New Roman", serif;
```

at `:root`. CSS substitutes nested `var()`s at the **declaring**
element's cascade, not the consumer's — so when `body`'s
`font-family: var(--font-body)` is evaluated, the inner
`var(--font-homepage-body)` is looked up at `:root`, where the
wrapping div hasn't injected anything, and the inner fallback
literal `"Lora"` wins. Result: body content silently degrades to
`Lora, Georgia, …` (no metric-matched `"Lora Fallback"` face — so
text reflows visibly when the real Lora woff2 finally arrives), and
portalled overlays (Rule #4 mounts modals to `document.body`,
outside the wrapping div) get the same broken chain.

`(public)/layout.tsx` fixes it with an SSR'd `<style>` tag that
re-declares the next/font CSS variables on **`:root`** (not `body`),
reading the family strings out of `homepageBody.style.fontFamily` /
`homepageHeading.style.fontFamily` (next/font exposes them as part
of the `NextFont` return type). Placing them at `:root` is essential
— that's the same cascade level where `--font-body` is declared, so
the nested `var()` substitution finally has a value to find. With
the fix, `body { font-family: var(--font-body) }` resolves to the
full metric-matched chain (`"Lora", "Lora Fallback", Georgia, …`)
and portalled modals inherit Lora natively without per-component
font classes.

The `<style>` injection is scoped to the `(public)` route group, so
admin / kitchen / franchisee routes (which don't load this layout)
keep `:root` untouched and their own type stacks unaffected.

**Defense in depth.** `themes/homepage/tokens.css` also uses inner-
fallback `var()` syntax: `var(--font-homepage-body, "Lora")`. If the
`<style>` injection ever drops out (a refactor accidentally removes
it, an experimental layout switches the wiring, etc.), the var still
resolves to the literal `"Lora"` — which matches the `@font-face`
declarations next/font registers globally. We lose the metric-matched
fallback face during font loading, but never the font itself.

**When you add a new font:** apply both ends — the next/font
`.variable` className on the wrapping div, and add the family to the
SSR'd `<style>` block on `:root` in `(public)/layout.tsx`. The
inner-fallback literal in `tokens.css` is the safety net, not the
primary mechanism.

## The weight ladder

| Weight | Cormorant Garamond use                                | Lora use                                              |
| ------ | ----------------------------------------------------- | ----------------------------------------------------- |
| 400    | Pull-quotes (italic), body italic emphasis            | Body paragraphs, captions                             |
| 500    | Default Cormorant weight: section titles, item names  | UI labels, table cells                                |
| 600    | Display headings (hero, About section)                | Emphasised body, button text                          |
| 700    | (avoid — too heavy in parchment context)              | Price callouts, the loyalty balance numeral, headlines that compete with imagery |

**The discipline:** Cormorant 600 only on the hero headline + the
Famiglia strip pull-quote. Section titles use Cormorant 500. Item
names use Cormorant 500. Anything heavier in Cormorant reads as ad
copy and breaks the editorial frame.

JetBrains Mono uses 500 only — rare appearances on order numbers, the
referral code, the points balance on the rewards card (when tabular
alignment is essential).

## The size ladder

Homepage sizes are *generous* — bigger than Core's 13px default
because the guest is reading at a normal phone distance, not
across-the-line.

| Token (informal) | Size    | Use                                                                        |
| ---------------- | ------- | -------------------------------------------------------------------------- |
| caption          | 12px    | Footer copy, fine print, the "We'll only use this for the receipt" reassurance |
| body-sm          | 14px    | `.pub-input` fields, secondary copy                                        |
| body             | 15–16px | The default body text size — paragraphs in About, item descriptions. V8 body is 15px / line-height 1.55. |
| label            | 18px    | Section headings inside cards (e.g. on `LoyaltyCard`)                      |
| h3               | 20px    | Sub-section headings on the landing                                        |
| h2               | 24–30px | Section titles (Cormorant 500/600)                                         |
| h1               | 36–48px | Page titles (Cormorant 600), the rewards page headline                     |
| display          | 48–72px | The hero headline — Cormorant 600, with line-height 1.1                    |

## The rules

1. **Display copy uses Cormorant; everything else uses Lora.** A 24px
   body paragraph in Cormorant reads as decoration. A 36px hero
   headline in Lora reads as commodity. Hold the line.
2. **Line-height ladder:**
   - Display (h1, hero): 1.1
   - Headings (h2, h3): 1.25
   - Body: 1.55 (V8 default — slightly looser than the typical 1.5)
   - Buttons + UI labels: 1
3. **Tabular numerals on every aligned price column** — same rule as
   Core. Without `font-variant-numeric: tabular-nums` (`.num` helper),
   item prices on a list drift across rows.
4. **Italic is bilingual signal.** The `.it` helper renders italic
   Cormorant — used for inline Italian phrases (`<span class="it">
   Margherita</span>` next to English / Polish copy) and for the single
   Cormorant pull-quote on About. Italic Lora is fine for in-paragraph
   emphasis but reserve italic Cormorant for the bilingual + editorial
   moments.
5. **Sentence case for headings** — "Find your nearest truck", not
   "Find Your Nearest Truck". Title case in Cormorant reads as
   theatrical; we want welcoming.
6. **Uppercase only for the smallest meta** — the eyebrow line above
   a section title, the "New" chip on an item card. 10–11px,
   `letter-spacing: 0.08em`.

## The hero specifics

The hero headline is the loudest piece of typography on the storefront
and gets a specific treatment:

- Cormorant Garamond 600 at the display range (48–72px depending on
  viewport).
- Tight `letter-spacing` (`-0.02em`) — display Cormorant reads better
  slightly condensed.
- Line-height 1.1 — display always tighter than body.
- A maximum of 8 words. If the headline needs more, it's two
  headlines.
- The V8 hero pairs the headline with a hand-drawn ochre underline
  SVG sweep and an Italian phrase in italic Cormorant directly above
  (`.it` class).

## The price callout specifics

Prices on item cards + the cart drawer + the rewards page get a
deliberate treatment:

- Lora 700, 18–22px (size varies by surface: 18px in item cards,
  22px in cart-line items, 26px on the tender total in checkout).
- Tabular numerals (`.num` helper).
- Currency suffix at 14px, NOT italic, no extra weight — `87.40 zł`.
- Never prefix-currency (Polish convention is suffix; even on the
  EUR / USD display modes, the suffix convention holds).

## What this typography is not

- It is **not** the Admin type scale. Admin's default is 14px Inter;
  Homepage's default is 15–16px Lora. The storefront has more
  breathing room and serif texture.
- It is **not** the Core type scale. Core uses 13px workhorse-tight;
  Homepage uses 15–16px guest-comfort with serif body.
- It is **not** Cormorant everywhere. Over-using the display serif
  flattens the hierarchy — Cormorant is the brand voice, not the
  voice. Lora does the work.

The Homepage type system is **brand voice (Cormorant Garamond) +
workhorse (Lora) + tabular precision (Mono)** — three faces, each in
its place, the editorial serif leading because this is the brand
surface, and the workhorse staying serif because the canvas is paper.
