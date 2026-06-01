# Typography

← back to [README](../README.md)

Loaded via `next/font` in **`src/app/admin/layout.tsx`** (not the root layout —
each route group loads its own faces so an admin change can't drift the
storefront). The loader exposes them as the `--font-admin-*` CSS variables on
the `#admin-portal-root` wrapper; the theme tokens below read through those. See
*Font scope* at the bottom for the indirection that makes this work (and the bug
it fixes).

## The three faces

| Face | Token | next/font var | Role |
|---|---|---|---|
| **Inter** | `--font-ui` | `--font-admin-body` | UI workhorse. Everything operational: tables, tickets, forms, prices, KDS chrome, button labels. |
| **Fraunces** | `--font-display` | `--font-admin-display` | The product's soul. High-contrast optical serif. Wordmark, hero headings, large display numerals, **and the dish name.** Used sparingly. |
| **JetBrains Mono** | `--font-mono` | `--font-admin-mono` | IDs, timers, prices, tabular figures. Anywhere a digit needs to not jitter. |

## Where each face goes

| Element | Face |
|---|---|
| Wordmark, hero titles, large KPIs | Fraunces |
| POS / KDS dish name | Fraunces (the only operational use) |
| Modifier text under a dish (`+ extra 'nduja`) | Fraunces *italic*, amber |
| Section eyebrows, button labels, tabs, table headers, body | Inter |
| Timers, prices, order ids, tabular numerals | JetBrains Mono |

When in doubt, **it's Inter.** Reaching for Fraunces should feel like a
choice, not a default.

## Type scale

Tokens on `[data-admin-theme]`:

| Token | Size | Use |
|---|---|---|
| `--text-2xs` | 11px | eyebrows, micro labels |
| `--text-xs` | 12px | secondary meta, captions |
| `--text-sm` | 13px | dense table body, chips |
| `--text-base` | 14px | **admin default** |
| `--text-md` | 15px | emphasised body |
| `--text-lg` | 17px | section headers, dish names |
| `--text-xl` | 20px | page subtitles |
| `--text-2xl` | 24px | page titles |
| `--text-3xl` | 32px | display numerals |
| `--text-4xl` | 40px | hero |

**Use the tokens, not literal `rem`/`px` values.** Inline `font-size: "0.75rem"`
is a code-smell — it breaks the scale and silently drifts.

## Weights & letter-spacing

- UI text: weight **500** (medium), letter-spacing **`-0.005em`**. Inter
  reads heavy at default tracking on dark; the negative tracking tightens
  it.
- Button labels: weight **500**, `-0.005em`.
- Display (Fraunces) hero / dish names: weight **500**, letter-spacing
  **`0.005em`** (positive — serifs breathe).
- **Eyebrows** (small caps labels: `OPEN`, `STARTERS`, `MAINS`): weight
  **600**, letter-spacing **`0.08–0.14em`**, `text-transform: uppercase`.
  These mark category headers, status pills, course tags.

## Tabular numerals

`font-variant-numeric: tabular-nums` on every number that updates or aligns:

- All prices (`42 zł`, `280.80 zł`)
- All timers (`9:07`, `14:32`)
- All KPI values (covers/hr, throughput, LTV)
- Any table column of numbers

If digits jitter when they change, this is missing.

## Modifier convention

Per-line modifier text inside a ticket / order line:

```css
font-family: var(--display);   /* Fraunces */
font-style: italic;
font-weight: 500;
font-size: 13.5–14px;
color: var(--warn);            /* amber — operational attention */
```

This is the **one** place serif italic gets used, and it ties the modifier
visually to its parent dish (which is also Fraunces). It also reads as a
deliberate "menu copy" voice rather than a sans annotation.

## Display numerals (KPIs)

Large metric values use Fraunces at `--text-3xl`–`--text-4xl`, weight 500,
`tabular-nums`. Example: revenue figures on the Dashboard, LTV on the CRM
profile, the Charge total on the POS tender sheet.

```css
font-family: var(--display);
font-weight: 500;
font-size: var(--text-3xl);     /* or 4xl */
font-variant-numeric: tabular-nums;
line-height: 1;
```

This is the second deliberate use of serif on operational surfaces. The
contrast — refined serif numerals on a flat dark background — is the
"investment-grade" tell.

## Don'ts

- Don't use Fraunces in dense operational chrome (table rows, sidebar,
  tooltips, badges). It costs glanceability.
- Don't use system fonts via `font-family: serif/sans-serif` — always use
  the token.
- Don't bold Fraunces (weight 700+). It loses the optical refinement.
  Stay at 500.
- Don't mix mono and Fraunces in the same numeric value. Pick one per
  context: mono for in-flow timers/prices, Fraunces for hero stat numerals.

## Font scope (why the tokens are declared twice)

The face tokens are defined on **two** elements, and the duplication is
load-bearing — don't "tidy" it away.

- `[data-admin-theme]` (= `<html>`) declares `--font-ui` / `--font-display` /
  `--font-mono` as `var(--font-admin-body|display|mono), <fallbacks>`.
- But `--font-admin-*` (the actual `next/font` families) are only defined on
  **`#admin-portal-root`**, the admin layout wrapper, because `next/font`'s
  `.variable` classes are applied there (so they don't leak to the storefront).

A `var()` inside a custom property is substituted **at the element where that
property is declared**. So up on `<html>`, `var(--font-admin-body)` is
undefined → the whole `--font-ui` token becomes *invalid at computed-value
time* → it inherits down **empty**, and is never re-evaluated where
`--font-admin-*` actually exist. The symptom: every `font-family: var(--font-ui)`
and `var(--font-display)` rule silently resolved to nothing and fell back to the
**browser-default serif** — the admin shell, the `.v2-page-loading` pill,
portaled overlays (`Dialog` / `Popover` / `Tooltip` / `Toast`), and the sidebar
brand wordmark.

**Fix** (in `src/app/themes/admin/index.css`, on `#admin-portal-root`):

```css
#admin-portal-root {
  /* re-declare the tokens HERE, where --font-admin-* are defined, so the
     indirection resolves for every consumer in the admin subtree */
  --font-ui: var(--font-admin-body), "Inter", ui-sans-serif, system-ui, …;
  --font-display: var(--font-admin-display), Georgia, "Times New Roman", serif;
  /* and set font-family directly so overlays portaled into this wrapper —
     siblings of .v2-shell, with no --font-ui rule of their own — inherit Inter */
  font-family: var(--font-admin-body), "Inter", ui-sans-serif, system-ui, …;
}
```

Keep these values in sync with the `[data-admin-theme]` definitions. Verified in
a real browser (`getComputedStyle`): body + portaled dialog resolve to Inter,
the sidebar wordmark to Fraunces. This is also why every admin overlay portals
into `#admin-portal-root` rather than `<body>` — see the *Dialogs / overlays*
note in [`components.md`](./components.md#dialogs--overlays) and the portal rule
in the [admin README](../README.md#the-portal-rule-do-not-skip).
