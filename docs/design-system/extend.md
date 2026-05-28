# Extending the system

← back to [README](./README.md)

How to add a colour, a surface, a page, or an icon **without drifting**
the design language. The short answer in every case is: edit one
canonical file, mirror it in the second, and stop there.

## Add a colour token

1. **Edit `src/app/globals.css`** — both `[data-admin-theme="dark"]`
   and `[data-admin-theme="light"]` blocks. Give the token a semantic
   name (`--info-soft-strong`), never a shade name (`--blue-300`).
   - Pick a value that **already exists** as a hue, just at a different
     opacity / mix. Don't introduce a new hue.
   - If you need a new hue, you're probably solving the wrong problem
     — talk to the design owner first.
2. **Mirror in `src/components/admin/v2/theme.ts`** if it'll be read by
   Recharts / JS / inline SVG.
3. **Mirror in `public/mockups/core-suite/system.css`** so the mockups
   pick it up.
4. **Document** in [`foundations/color.md`](./foundations/color.md) — append to the right
   table; don't reorder.

```css
/* globals.css — dark block */
--info-soft-strong: color-mix(in oklab, var(--info) 22%, var(--surface-1));

/* globals.css — light block */
--info-soft-strong: color-mix(in oklab, var(--info) 14%, var(--surface-1));
```

**The forbidden:** adding `#7faab8` to a component. Use the token.

## Add a surface

A "surface" is a panel that holds content (card / sheet / dialog
body). We have `--surface-1` (panel) and `--surface-2` (raised inside
a panel) and `--surface-3` (subtle nested raise). Three steps of depth
is the ceiling — adding a fourth means rethinking the layout.

If you genuinely need a new surface treatment:

1. Confirm it isn't actually a `.callout` or a `.well` — those exist.
2. Reuse `--surface-2` with a `--border-strong` hairline before
   reaching for a new token.
3. If it must be new: extend [`foundations/material.md`](./foundations/material.md) with the
   stacking rule + a screenshot.

## Add an admin page

The nav config lives in `src/components/admin/v2/nav.config.ts`. New
pages must:

1. Be reachable from the **v2 admin shell** (`AdminShell.tsx`) — top
   nav or a section group.
2. Use the **glass design classes** (`glass-card`, `glass-input`,
   `glass-btn`, `admin-text`). Don't roll a one-off panel.
3. Register in `/admin/capabilities` (CLAUDE.md rule #9) — same commit.
   Include `name`, `summary`, `href`, `envVars`, `status`.
4. Have a **mobile variant** (or a graceful read-only state on small
   screens). Don't ship a desktop-only admin page.

The page header pattern (use, don't redesign):

```tsx
<AdminPageHeader
  title="Inventory"
  description="Stock by location · re-order points · usage forecast"
  actions={[<Button key="add">+ Add item</Button>]}
/>
```

## Add an icon

We use **custom stroke icons**. Never emoji in UI chrome, never a third
party icon font.

1. Open `src/components/icons/index.tsx` (or the corresponding stroke
   library).
2. Add a new `forwardRef` component named for what it depicts
   (`<RefreshIcon />`, not `<IconA1 />`).
3. Geometry: 24×24 viewBox, `stroke="currentColor"`, `strokeWidth={1.5}`,
   `fill="none"`, `strokeLinecap="round"`, `strokeLinejoin="round"`.
4. Test at 16px and 22px — anything that doesn't read at 16px is too
   ornate.

Forbidden icons inside UI:

- 📌 ⟲ 🔗 🎂 — replace with stroke equivalents.
- Filled glyphs from a generic icon font (gives the surface a "Bootstrap"
  feel).

Allowed: the EU-14 allergen pictograms (Concierge) and real chat-content
emoji inside WhatsApp message bubbles.

## Add a button variant

We have **two** primary actions (`.btn.primary`, `.btn.primary.xl`) and
**three** secondaries (`.btn` ghost / `.btn.ghost` bordered-ghost /
`.btn.danger`). That's it.

Before adding a sixth variant, ask:

- Is this just a primary in a different size? Use `.btn.xl` / `.btn.sm`.
- Is this just a ghost in a different colour? Apply `color: var(--info)`
  inline; the variant doesn't need a new class.
- Is this a brand-new pattern? Push back on the requirement — the user
  doesn't need another button shape, they need to understand what to
  click.

If the answer is genuinely "yes, new variant" — extend
[`components.md`](./components.md#buttons) with the contract and the
hover/focus/disabled states.

## Add a font weight

Don't, unless your case is the only one in the codebase that needs it.
We use:

- Inter **400** (body), **500** (UI labels), **600** (emphasis),
  **700** (rare — admin section titles only).
- Fraunces **500** (most), **600** (display headings only).
- JetBrains Mono **400** + **500**.

Anything past 700 reads heavy in this palette; anything below 400
reads frail in dark mode.

## Add a module to this design system

If a new module ships (e.g. a Reservations console):

1. Build the live component + mockup first.
2. Once stable, write `docs/design-system/modules/<name>.md` following
   the structure of the existing modules:
   - One-line thesis at the top
   - **Live code** / **Mockup** pointers
   - Layout sketch in ASCII
   - Per-element rules with token references
   - Per-module actions + dialogs
   - "What this module is not" closer
3. Link from [`README.md`](./README.md) under **Modules**.

The closing "what this module is not" is the most important section.
A module that doesn't know what it isn't will drift.

## When in doubt

Read [`foundations/philosophy.md`](./foundations/philosophy.md). The Rams / Ive / Thiel triad
resolves most edge cases. If it's still ambiguous after that, the
question is probably:

> "Am I adding signal or noise?"

If you can't articulate the signal, you're adding noise.
