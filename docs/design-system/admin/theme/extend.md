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
4. **Document** in [`color.md`](./color.md) — append to the right
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
3. If it must be new: extend [`material.md`](./material.md) with the
   stacking rule + a screenshot.

## Add an admin page

The nav config lives in `src/components/admin/v2/nav.config.ts`. New
pages must:

1. Be reachable from the **v2 admin shell** (`AdminShell.tsx`) — top
   nav or a section group.
2. Build from the **`v2/ui` primitives** — `PageHeader` + `ViewToolbar` for the
   command surface, `Card` / `Input` / `Select` / `Button` for content. **Never
   the legacy `glass-card` / `glass-input` / `glass-btn` classes** (older
   `--admin-*` token system, being retired — lint-guarded in the page layer).
   Don't roll a one-off panel.
3. Register in `/admin/capabilities` (CLAUDE.md rule #9) — same commit.
   Include `name`, `summary`, `href`, `envVars`, `status`.
4. Have a **mobile variant** (or a graceful read-only state on small
   screens). Don't ship a desktop-only admin page.

**Write paths as canonical `/admin/…`.** The page physically lives under
`src/app/admin/*`; a manager / franchisee navigate it as `/manager/*` /
`/franchisee/*` via rewrites. The nav href in `nav.config` stays `/admin/…` —
`useNavSections` re-roots it per role automatically. For **in-page** navigation
(a `<Link>`, a `router.push`, a notification deep-link), don't hardcode the
prefix either: call `useAdminBase()` + `withAdminBase(base, "/admin/…")`
(`src/lib/admin-base.ts`) so the link keeps the user in their own prefix. Server
components read the base from the role via `adminBaseForRole(user.role)` (see the
capabilities ledger). The `/api/admin/*` endpoints are **not** prefixed — leave
those as-is. Full contract: [README → Role-prefixed back-office URLs](../README.md#role-prefixed-back-office-urls).

The page header pattern (use, don't redesign):

```tsx
<AdminPageHeader
  title="Inventory"
  description="Stock by location · re-order points · usage forecast"
  actions={[<Button key="add">+ Add item</Button>]}
/>
```

**Scoping by location?** Don't render a per-page control. Location is shell-level
*scope*: read it with `const { location } = useAdminLocation()` (`""` = all sites)
and filter your data by it; the topbar `ScopeSwitcher` is the single switcher. The
old per-page `LocationFilter` and sidebar `LocationSwitcher` were removed in the
redesign (Phase 2) — a per-page location pill is now lint-guarded. See
[Location → Scope](./components.md#location--scope-one-switcher-shell-level).

## Add an icon

We use the **`lucide-react`** stroke-icon set for UI chrome. Never emoji in
UI chrome, never an icon font.

1. Reach for `lucide-react` first — import the named icon for what it depicts
   (`import { RefreshCw } from "lucide-react"`), not a generic one. The nav
   config (`src/components/admin/v2/nav.config.ts`) is the canonical example of
   icons wired per item.
2. Only when lucide has no fitting glyph, hand-author a bespoke `forwardRef`
   SVG named for what it depicts (`<RefreshIcon />`, not `<IconA1 />`) — see
   the existing one-offs `src/components/FulfillmentIcon.tsx` and
   `src/components/location/AllergenIcon.tsx`.
3. Geometry for a bespoke icon: 24×24 viewBox, `stroke="currentColor"`,
   `strokeWidth={1.5}`, `fill="none"`, `strokeLinecap="round"`,
   `strokeLinejoin="round"` — so it sits beside the lucide set without
   clashing.
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

## Add a metric / KPI explanation (the ⓘ)

Any ⓘ `InfoButton` on a KPI card, metric or what-if lever is governed by
**CLAUDE.md Rule #12** — five fixed sections, fixed order, fixed labels.
Don't hand-roll it:

1. Build the dialog body from **`MetricExplainer`** (`src/components/admin/Explainers.tsx`).
   Its five props — `description`, `institutional`, `plain`, `tips`,
   `methodology` — are all required, so a half-written explanation won't
   compile.
2. No section may be empty or hand-waved ("self-explanatory" is not an
   explanation). Each needs real content: the analyst framing + benchmark,
   a concrete złoty example, operator actions, and the formula + data source.
3. Never invent new section labels or a sixth section — extend
   `MetricExplainer` itself if the contract genuinely needs to change, and
   update [`components.md`](./components.md#metric-explainers--the--contract)
   + Rule #12 in the same commit.
4. Wrap the trigger with `InfoButton` (`size="sm"` in a KPI-card label).

### The page-level intro card (the "How to read these numbers" card)

The intro card below the KPI row on a report or sandbox follows the **same
five-section contract** — build it from **`PageExplainer`**
(`src/components/admin/Explainers.tsx`), not by hand-assembling the individual
blocks. `PageExplainer` shares `MetricExplainer`'s required-prop shape
(`description`, `institutional`, `plain`, `tips`, `methodology`) and renders
the same sections in the same order, wrapped in a `<Card>` with a heading.
Pass `title` (defaults to "How to read these numbers") and an optional `hint`.
This keeps the page intro and the per-metric ⓘ dialogs in one voice and stops
an intro card from silently dropping the institutional framing or reordering
sections. If the contract itself must change, edit both `MetricExplainer` and
`PageExplainer` together and update
[`components.md`](./components.md#metric-explainers--the--contract) + Rule #12
in the same commit.

The full block contract — colours, icons, the colour-token exception — lives
in [`components.md`](./components.md#metric-explainers--the--contract).

## Add a module to this design system

If a new module ships (e.g. a Reservations console):

1. Build the live component + mockup first.
2. Once stable, write `docs/design-system/<theme>/modules/<name>.md` for
   the owning theme (Core for productised IP, Admin for back-office,
   Homepage for storefront), following the structure of the existing
   Core modules:
   - One-line thesis at the top
   - **Live code** / **Mockup** pointers
   - Layout sketch in ASCII
   - Per-element rules with token references
   - Per-module actions + dialogs
   - "What this module is not" closer
3. Link from [`README.md`](./README.md) under **Modules**.

The closing "what this module is not" is the most important section.
A module that doesn't know what it isn't will drift.

## Design-system governance — the lint ratchet

The admin **page layer** (`src/app/admin/**/*.tsx` + the top-level
`src/components/admin/*.tsx`) is guarded by an ESLint `no-restricted-syntax` rule
(in `eslint.config.mjs`) at **`error`**. It bans, in that layer:

- raw `<button>` / `<input>` / `<select>` — use `Button` / `IconButton` / `Input` /
  `Select` from `v2/ui`;
- the legacy `glass-card` / `glass-input` / `glass-btn` classes — use `Card` /
  `Input` / `Button` (the `.v2-*` classes / components);
- inline 6-digit hex literals — use a `var(--token)` (CSS) or the `theme.ts`
  palette (charts/JS).

**It's a bulk-suppressions ratchet, not a wall.** Existing violations are
grandfathered in `eslint-suppressions.json` (run `npx eslint --suppress-rule
no-restricted-syntax` to regenerate the baseline). The count can only **shrink** —
any *new* violation fails `npm run lint`. To clear a suppression:

1. **Convert** to the primitive (`Button` / `Input` / `Select` / `Card`), or
2. for a **legitimately custom** interactive element — a card-as-button, an icon
   toggle, a table-row action with bespoke needs — keep it raw with an inline
   `// eslint-disable-next-line no-restricted-syntax -- ds-ok: <reason>`. Reserve
   the primitives for genuine **action buttons** and **form fields**; not every
   `<button>` is a `<Button>`.

After editing a file, run `npx eslint --prune-suppressions` to drop entries you've
fixed (keeps the baseline honest). The `v2/` infrastructure and shell chrome are
out of scope (they legitimately render raw elements). The live burn-down is
tracked in [`../redesign-progress.md`](../redesign-progress.md).

## When in doubt

Read [`philosophy.md`](./philosophy.md). The Rams / Ive / Thiel triad
resolves most edge cases. If it's still ambiguous after that, the
question is probably:

> "Am I adding signal or noise?"

If you can't articulate the signal, you're adding noise.
