# Sud Italia — Design System

The shared visual + interaction language for the whole operating system: POS,
KDS, CRM, Concierge, WhatsApp, and every admin surface, plus the guest
storefront.

Code is the source of truth. The canonical tokens live in
`src/app/globals.css` (`[data-admin-theme]` blocks + the `@theme inline` public
tokens) and are mirrored for JS/Recharts in `src/components/admin/v2/theme.ts`.
This document explains the *why* and the *how to extend*.

---

## 1. Philosophy

Three ideas, in tension, held together:

1. **Dieter Rams — "as little design as possible."** Every element earns its
   place. No decoration that isn't information. Borders are hairlines, not
   boxes; shadows describe elevation, not drama.
2. **Jony Ive — soul through obsession.** Restraint is not sterility. The
   warmth of the palette, the optical serif of the wordmark, the easing curve
   of a panel — these are where the product stops feeling like a tool and
   starts feeling considered.
3. **Quiet power (the Thiel note).** The system should feel like a proprietary
   advantage: calm, fast, certain. It never shouts. Confidence is conveyed by
   how little it needs to do to feel complete.

**Operating principle that resolves conflicts:** *in high-pressure surfaces
(kitchen, line, checkout) operational clarity outranks brand expression; in
exploratory surfaces (CRM, concierge, owner dashboards) beauty is allowed to
breathe.* When a kitchen ticket and a guest profile disagree about how loud a
color should be, the kitchen wins on its screen and the guest profile wins on
its own.

---

## 2. Color

One signature accent — **deep burgundy / oxblood** — plus a restrained
metallic (**champagne platinum**), a calm steel-blue for focus/info, and a
disciplined semantic set. Burgundy matures the old Italia red into fine-dining
territory *and* finally separates "brand" from "danger," which used to be two
near-identical reds.

### Dark (canonical) — `src/app/globals.css` `[data-admin-theme="dark"]`

| Role | Token | Value |
|---|---|---|
| Page background | `--bg` | `#0c0b0e` (warm-neutral charcoal) |
| Sidebar / modal | `--surface-1` | `#17161c` |
| Input / inset | `--surface-2` | `#1d1b23` |
| Active / raised | `--surface-3` | `#262430` |
| Hover | `--surface-hover` | `#2f2c39` |
| Hairline | `--border` | `rgba(255,255,255,.10)` |
| Text | `--fg` | `#f5f3ee` (warm off-white) |
| Text muted | `--fg-muted` | `#c0b9b0` |
| Text subtle | `--fg-subtle` | `#978e85` |
| **Brand** | `--brand` | **`#a62d49`** |
| **Platinum** | `--platinum` | **`#cbb48a`** |
| Focus / info | `--border-focus` / `--info` | `#8fa9c9` / `#6e92c0` |
| Success | `--success` | `#2fa875` |
| Warning | `--warning` | `#d9a441` |
| Danger | `--danger` | `#e2504b` |

### Light (warm paper, not clinical white) — `[data-admin-theme="light"]`

Same DNA on a warm-paper base: `--bg #faf7f2`, `--surface-1 #ffffff`,
`--fg #1c1815`, `--brand #97283f`, `--platinum #9c7e4e`, `--info #3f6493`.
Light mode is **opt-in** (the boot script in `theme.ts` does not honor
`prefers-color-scheme`) so operators never hit a half-lit surface by accident.

### Rules

- **Never hardcode a brand/semantic hex in a component.** Read the token. The
  one exception is status *text* on soft badge fills, where a slightly brighter
  hardcoded hex is used deliberately to hold ≥4.5:1 contrast on dark.
- **Platinum is jewelry, not paint.** Use it for hairlines, the wordmark mark,
  owner-tier flourishes, key numerals — never as a fill or an action color.
- **Burgundy is brand, never status.** A red ticket means *late*, not *brand*.
- Soft tints come from `--brand-soft` / `--*-soft`; RGB-triplet siblings
  (`--admin-accent: 166,45,73`, etc.) exist only so `rgba(var(--x), a)` overlays
  line up.

### Data visualization

Categorical palette is burgundy-led and harmonized (see `theme.ts` `chart`):
`#a62d49, #cbb48a, #6e92c0, #2fa875, #c77f4a, #8e6fb0, #d98aa0, #7fa86b`.
Sequential/heatmap ramps should interpolate within a single hue (burgundy or
steel), never rainbow. Axes use `--fg-subtle`; gridlines use the hairline alpha.

---

## 3. Typography

Loaded via `next/font` in `src/app/layout.tsx` (previously *named but never
imported* — everything silently fell back to system fonts).

- **Inter** (`--font-inter` → `--font-ui` / `--font-body`) — the UI workhorse.
  All operational text: tables, forms, tickets, POS, KDS.
- **Fraunces** (`--font-fraunces` → `--font-display` / `--font-heading`) — a
  high-contrast optical serif. The product's "soul." **Reserved** for the
  wordmark, hero headings, and large display numerals. *Never* used in dense
  operational UI — it would cost glanceability.
- **Mono** (`--font-mono`, system JetBrains/SF Mono stack) — IDs, timers,
  tabular numerals.

Type scale is fixed on `[data-admin-theme]` (`--text-2xs` 11px → `--text-4xl`
40px), base **14px**. Use the tokens, not literal rems. Tabular numerals
(`font-variant-numeric: tabular-nums`) on every metric, price, and timer so
digits don't jitter.

---

## 4. Material — elevation, border, radius, motion

- **Elevation** is shadow + surface, never just shadow. `--shadow-xs…lg`
  deepen on dark and soften (warm-tinted) on light. A raised element steps up a
  surface *and* gains a shadow.
- **Hairlines over boxes.** `--border` (6% white on dark) is the default
  divider; `--border-strong` only when grouping needs to read at a glance.
- **Radius** scale `--radius-xs` 4px → `--radius-2xl` 24px, `--radius-pill`.
  Cards 12px, inputs/buttons 8px, chips pill. Consistency here is most of what
  makes the suite feel like one product.
- **Motion** — `--duration-fast` 120ms / `--duration-base` 200ms /
  `--duration-slow` 320ms, easing `cubic-bezier(0.32,0.72,0,1)`.
  - *Operational* (POS, KDS, tables): fast or none. State changes are instant;
    a 200ms fade is the ceiling. Never animate a kitchen ticket's position in a
    way that delays reading it.
  - *Exploratory* (CRM, concierge, dashboards, storefront): the full,
    buttery range — panels slide, numbers count up, charts draw in.
  - Everything respects `prefers-reduced-motion`.

---

## 5. Component contracts

The v2 library lives in `src/components/admin/v2/ui/`. All components read
tokens; none hardcode color.

- **Button** (`Button.tsx` / `.v2-btn-*`, `.glass-btn-*`) — primary
  (burgundy), success, danger, info (steel), ghost. One primary per view.
- **Card** (`Card.tsx` / `.glass-card`) — surface-1, hairline, 12px, `--shadow-xs`;
  hover lifts the border, not the whole card, on operational lists.
- **Table** (`Table.tsx`) — **48px row baseline** is the target across modules
  (Orders/Customers/Loyalty/Staff drift between 40–60px today; converge them).
- **Input** (`.glass-input`) — surface-2 → surface-1 on focus, steel focus ring
  + 3px soft halo.
- **Badge** (`Badge.tsx`, `.badge-*`) — soft fill from token + brighter text;
  one tone per status, mapped consistently suite-wide.
- **Dialog / Popover / Toast** — portaled to `document.body` (admin layout
  traps fixed elements otherwise — see `CLAUDE.md` rule #4).

---

## 6. Unified experience strategy

All modules share the **AdminShell** (`src/components/admin/v2/AdminShell.tsx`):
248px sidebar, glass topbar, single nav source of truth
(`nav.config.ts`). What differs per module is *density and tempo*, not the
language:

```
        glanceable / instant ←─────────────────────────→ exploratory / beautiful
   KDS ── POS ── Orders ── Inventory ── Reports ── Dashboard ── CRM ── Concierge
   (full brightness        (fast, dense          (data-viz       (whitespace,
    status, no serif,       tables, one-tap       breathes)        serif accents,
    no animation)           actions)                               motion)
```

Same tokens, same components — the spectrum is achieved by *how much* of the
system each surface uses, not by forking the system.

---

## 7. Per-module redesign specs

The token foundation already reskins every module (burgundy, warm neutrals,
real fonts, refined charts). These are the **structural** next moves. Each is
written to be implemented against a live preview (`npm run dev`).

> High-fidelity HTML mockups of POS, KDS, and the unified Guest Engagement hub
> live at `public/mockups/core-suite/`. Open
> **`/mockups/core-suite/index.html`** on any deploy (locally `npm run dev` →
> same path). All asset + cross-page links are absolute (`/mockups/core-suite/…`)
> so they survive Next's trailing-slash redirect. They use the real
> tokens/fonts and are the agreed visual target for the React implementation.

### 7.1 KDS — *shipped (re-tone)*

Already done: Atlas fleet-command + kiosk palettes warmed to the suite family
(`.kds-floor-dark` / `.kds-os` in `globals.css`), status hues kept
high-contrast and distinct, type left as fast sans/mono. The kitchen is the one
place brand yields entirely to legibility. **Next:** make the bump-bar hotkey
map permanently visible as a faint footer legend; add a single platinum hairline
under the active lane header as the only "premium" cue.

### 7.2 POS — *the money surface*

- **Layout:** two-pane — menu grid (left, 60%) + live ticket (right, 40%).
  Ticket is always visible, never a drawer. Category rail is a vertical strip,
  not top tabs (less travel for the thumb on iPad).
- **Speed:** every add is one tap; modifiers are a single inline sheet, not a
  modal stack. Running total uses `tabular-nums` and updates with zero motion.
- **System use:** burgundy only on the single "Charge" action; everything else
  is neutral surfaces + hairlines. Success-green confirms payment, then resets.
- **Device:** designed iPad-first (landscape), scales to desktop by widening
  the menu grid columns, not by reflowing.

### 7.3 Guest Engagement — *merge Concierge + WhatsApp + CRM*

Today Concierge and WhatsApp are split pages with a chat-app mental model that
fights the dashboard. **Unify** into one "Guest Engagement" hub:

- **Three-pane:** conversation list (left) · transcript (center) · **guest
  profile** (right) — the right pane is the CRM record (LTV, tier, history,
  allergens, last visit) so an operator never context-switches mid-reply.
- This is the most *exploratory* surface: generous whitespace, Fraunces on the
  guest's name, soft platinum tier markers, count-up on lifetime value.
- Concierge AI capabilities (`get_menu`, `place_order`, …) become an inline
  "assist" rail in the transcript, not a separate page.

### 7.4 Executive Dashboard — *the investor-facing screen*

- **Hero band:** 3–4 KPIs in Fraunces display numerals with `tabular-nums` and
  a sparkline beneath each; period selector top-right.
- **Restraint:** one chart per question, generous margins, the harmonized
  categorical palette, single-hue ramps for trends.
- **"Next 60 minutes" widget** (already strong) stays above the fold — it's the
  one operational element on an otherwise calm, beautiful page.

---

## 8. Not yet shipped — prioritized backlog

1. **Converge table row heights** to a 48px baseline across
   Orders/Customers/Loyalty/Staff (currently 40–60px).
2. **Tokenize inline `font-size`** literals in legacy admin `.tsx` (e.g.
   `AdminDashboard.tsx`) — replace `"0.75rem"` with `var(--text-xs)`. Low risk,
   do incrementally with visual checks.
3. **Mobile variants** for `Capabilities` and `AI` (no `Mobile*` split today —
   desktop-only on phones).
4. **Structural module redesigns** (§7.2–7.4) — implement with live preview.
5. **Storefront depth pass** — apply Fraunces hero treatment + burgundy CTAs
   intentionally per section (foundation already cascaded the tokens/fonts).

---

## 9. How to extend without drifting

- Add a color? It goes in **both** `[data-admin-theme]` blocks **and**
  `theme.ts`, plus an `--admin-*` triplet if overlays need it. Never inline.
- Add a surface? Use an existing `--surface-*`; don't invent a new gray.
- New admin page? Register it in `/admin/capabilities` (CLAUDE.md rule #9) and
  frame it in `AdminShell` with a `.v2-page-header`.
- Reach for Fraunces? Only if it's a wordmark, a hero, or a display numeral.
  When in doubt, it's Inter.
