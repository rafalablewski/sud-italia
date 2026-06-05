# Sud Italia Admin — Redesign Blueprint

> **The operating system for the next generation of restaurant brands.**
> A first-principles redesign of `/admin/*` — interaction systems, design-system
> governance, visual consistency, operator efficiency, enterprise usability.
> `/core/*` (POS / KDS / Guest / Service) is a separate suite and out of scope.
>
> This is a design-leadership document, not a coat of paint. It deletes patterns,
> renames others, and adds enforcement so the system survives 100 engineers.
> Everything is expressed in the **existing token vocabulary** (`src/app/themes/admin/index.css`)
> so it is implementable, not aspirational.

---

## 1 · Executive Assessment

### What is fundamentally RIGHT (protect it)
- **The token system is institutional-grade already.** Warm-charcoal canvas,
  burgundy/platinum accents kept distinct from semantic red, flat solids +
  hairlines, neutral (never tinted) shadows, a 4/8px grid, a single motion curve
  (`cubic-bezier(0.32,0.72,0,1)`), steel focus. This is a Linear/Stripe-grade
  foundation. **We do not touch the palette.**
- **The architecture is correct.** Thin server `page.tsx` → `Admin*.tsx` client
  component → shell-provided chrome. Information architecture (sidebar sections)
  is sound.
- **`PageHero` proved that data-driven, enforced primitives work** — every page
  uses it. The *idea* is right.

### What is fundamentally WRONG (the real disease)
The platform doesn't have a *visual* problem. It has a **governance** problem that
manifests as a **control-layer** problem. Three root causes:

1. **Selection is painted with brand color.** Active location pills, active tabs,
   active nav all flood with `--brand-soft` and *drop their border*. This is the
   single most damaging decision: it makes "which thing is selected" and "which
   thing commits an action" speak the same language, it causes a 1px layout shift,
   and it makes every control look tinted and busy. **Brand must mean commit, and
   only commit.**
2. **The header tries to be two things at once.** Identity (where am I + the one
   action) and control (navigate + filter) are crammed into one platinum-railed
   panel. That's why three switcher idioms stack in 120px and the page feels
   incoherent before you read a word.
3. **Primitives exist but nothing enforces them.** ~43 raw `<button>`s, 38
   `glass-input`s, a whole legacy `glass-card` island, ~36 raw hex literals. The
   audit found these *by hand*. A rule that is checked by a human once is not a
   rule — it's a suggestion. **Drift is the absence of CI, not the absence of
   taste.**

> **Diagnosis in one line:** the design is good; the *system* is ungoverned and
> the *control layer* conflates selection with action and identity with control.
> Fix those three things and the platform reads as institutional software.

---

## 2 · Design Principles (the constitution)

1. **One action language.** Exactly three button levels; exactly one primary per
   view. Brand fill is reserved for the single commit action.
2. **Selection is a neutral raise, never a brand flood.** Selected = `--surface-3`
   + `--border-strong` + full-contrast text. Brand never marks "selected."
3. **One switching language.** Location is *scope* (a shell-level context), not a
   per-page filter. There is one scope switcher in the whole product.
4. **One save language.** Settings autosave (toggle = saved). Editors use a
   contextual SaveDock that appears only when dirty. No parked grey Save button.
5. **Identity ≠ control.** The page header says where you are and offers the one
   action. The toolbar, attached to the data, navigates and filters. Never merged.
6. **Clarity before personality.** Decorative chrome (the platinum hero rail) is
   deleted. Restraint *is* the brand.
7. **Density without chaos.** Stripe-grade density comes from hairlines and
   rhythm, not from boxes inside boxes.
8. **Hairlines over boxes.** One border defines one box. Children separate with
   dividers, never a second bordered panel.
9. **Flat planes, transient depth.** Static content never floats. A shadow means
   "this is temporary and above the page" (dialog, popover, dock) — nothing else.
10. **The primitive is the contract.** If it isn't in `v2/ui`, it doesn't exist.
    Required props make the wrong build uncompilable.
11. **Keyboard-first.** Every action is reachable from `⌘K`. The mouse is optional.
    Operators move at the speed of their hands.
12. **Always show the scope.** The operator must never wonder which location's
    data they are reading. Scope is in the breadcrumb, always.
13. **Motion is feedback, not decoration.** ≤200ms on operational surfaces;
    motion only confirms a state change.
14. **Accessible by default.** AA contrast, visible focus, reduced-motion honored.
    Institutional software is accessible software.
15. **Automate the guardrails.** Every rule in this document has a lint or CI
    check. Governance you cannot enforce is a wish.

---

## 3 · The Admin Interaction System

### 3.1 Buttons — three levels, two semantic overrides

| Level | Token recipe | Meaning | Count per view | Label |
|---|---|---|---|---|
| **Primary** | `--brand` fill, darker edge | The one commit / money action | **Exactly 1** | Always |
| **Secondary** | `--surface-2` + `--border-strong` | Default neutral action (Export, Filter, secondary create) | 0–n | Always |
| **Tertiary (ghost)** | transparent + hairline on hover | Cancel, inline, low-frequency | 0–n | Always |

**Two semantic overrides** (not a fourth level — they replace *primary* in a
specific context): `danger` (destructive confirm — **only** inside a Dialog or a
row action, **never** in a page header) and `success` (mark-ready / confirm in
operational flows: Orders, KDS handoffs).

**The icon-only reversal.** Today the hero *forces* icon-only square actions.
**We delete that rule.** A primary action always carries its verb — "Save",
"New supplier", "Export". Icon-only is permitted in exactly two places:
- **Dense utility controls** that are universally understood: overflow `⋯`,
  close `✕`, expand/collapse, step `‹ ›`. Always with `aria-label` + tooltip.
- **Icon toggles** with a clear on/off state.
Never an icon-only *primary*. "Save" must say Save.

**Behaviour rules:**
- **Save** → see §3.5. Never a permanently-rendered, perpetually-disabled hero
  button.
- **Create** → primary button labeled with the object verb (`New supplier`).
  Opens a Dialog or a right-side panel. One create entry per view.
- **Export** → secondary, labeled `Export`. Opens a small popover for
  format/range when needed. **Never primary**, never competes with Create.
- **One primary per view.** If two actions feel primary, the hierarchy is wrong —
  fix the hierarchy, don't add a second brand button.

### 3.2 The switching taxonomy — three roles, three widgets, never mixed

| Intent | Question it answers | Widget | When |
|---|---|---|---|
| **Scope** | *Whose data am I operating on?* | **Scope switcher** (shell) | Location / region / market. §3.3 |
| **Navigate** | *Which view of this object?* | **Underline `Tabs`** | Orders Kanban/Table, Recipes/Ingredients, Settings sections |
| **Filter** | *Which subset of the data?* | **`Segmented`** (≤4), **`Select`** (5+), **filter chips** (stackable) | status, segment, category |

The rule that ends "three idioms stacked": **scope lives in the shell, navigation
lives once at the top of the content, filters live in a toolbar attached to the
data.** They are never adjacent in a single panel again.

- **Underline tabs** are the *only* thing called "tabs." They are structural
  navigation between sub-views and are rare.
- **`Segmented`** is the renamed pill `Tabs` — a true segmented control on a
  `--surface-2` track, selected segment = `--surface-3` + `--shadow-xs`
  (selection-as-raise, §3.8). For ≤4 short mutually-exclusive options.
- **`Select`** for 5+ or long options.
- **Filter chips** (removable, `+ Add filter`) for multi-dimensional, stackable
  filtering (Stripe/Linear pattern). Replaces stacking three segmented rows.

### 3.3 Location → **Scope**: one switcher that scales 1 → 500

**Question the assumption.** Location is not a *page filter*; it is *operating
context*. A filter belongs to a dataset; context belongs to the session. So we
**delete the per-page `LocationFilter` pill row AND the separate sidebar
`LocationSwitcher`** (the components doc literally admits these two coexist —
that coexistence is the bug) and replace both with **one Scope switcher** in the
shell, surfaced in the breadcrumb so it is always visible:

```
Sud Italia  ▸  Kraków  ▸  Orders
            └── scope switcher (click / ⌘L)
```

**It changes shape with scale, never identity:**

| Locations | Presentation |
|---|---|
| **1** | Static label. No control — there is nothing to switch. |
| **2–5** | Click breadcrumb → compact popover list, keyboard-navigable. |
| **5–50** | Combobox with search, grouped by region/market, recents pinned. |
| **50–500** | Full **scope palette** (`⌘L`): virtualized, searchable, grouped Region → Market → Location, **multi-select for aggregate/compare views**, **saved scopes** ("My region", "All EU", "Flagships"). |

- **Scope persists** (per user) and **drives every page** by default.
- A page that genuinely needs to read a *different* location than the session
  scope (a comparison report) shows an **inline scope-override chip** that
  visibly reads "overriding: Warszawa · reset" — it never silently forks into a
  floating pill row.
- **Aggregate is first-class.** "All locations" and "Kraków + Warszawa" are
  selectable scopes; KPI surfaces roll up; tables gain a Location column. This is
  what makes the product credible for a 500-unit operator.

This single change removes the audit's biggest visual offender (the floating,
border-shifting pill row) by removing the *category* of control entirely.

### 3.4 Filters & display controls
- Live in the **view toolbar** (§4), right-aligned, in this order: `filter chips`
  · `sort` · `display` (density / columns / group-by).
- Active filter count badges on the `Filter` control.
- A filter is **never** styled with brand. Active filter chips use
  `--surface-3` + `--border-strong` + a removable `✕`.

### 3.5 Save states — the SaveDock
| Surface | Pattern |
|---|---|
| **Settings & toggles** | **Autosave.** `Switch` persists on change (Rule #7). Inline transient "Saved ✓". No button. |
| **Editors / forms** (Menu, Recipes, Growth, Users) | **`SaveDock`** — a floating action bar, pinned bottom-center, that exists **only while dirty**. |

`SaveDock` states (one component, `useSaveState` hook):
```
idle    → (not rendered)
dirty   → [ 3 unsaved changes ]        [ Discard ]  [ Save changes ]   ← primary
saving  → [ Saving… ]                  (disabled, spinner)
saved   → [ ✓ Saved ]                  (auto-dismiss 1.5s → idle)
error   → [ ⚠ Couldn't save · Retry ]  (danger-toned, persistent)
```
The dock floats (shadow = "transient", §3.9) and is the **only** place a primary
Save ever appears. It kills the parked-grey-button anti-pattern and unifies the
five different save expressions found in the audit.

### 3.6 Empty states
One primitive: `EmptyState` — quiet icon, one-line headline, one-line guidance,
**one** action (usually the page's primary Create). No bespoke `glass-card`
empties. Distinguish three flavors via a prop: `empty` (nothing yet — show the
create CTA), `filtered` (no matches — show "Clear filters"), `unconfigured`
(needs setup — link to settings).

### 3.7 Loading states
One primitive: `<PageLoading label="Orders" />` — guarantees the `.v2-page`
wrapper (fixes the mobile-pill trap) and consistent copy ("Loading Orders…").
Hand-written per-page strings are banned. Skeletons (not spinners) for
content-shaped regions (tables, KPI rows) to preserve layout and reduce perceived
latency — the Stripe/Linear feel.

### 3.8 Status states — one semantic chip
`Badge` is the only status widget. Tone maps to meaning, never to decoration:
`success` (live/ready/paid) · `warning` (attention/awaiting) · `danger`
(failed/blocked) · `info` (in-progress) · `neutral` (draft/archived) ·
`platinum` (owner-tier). A leading 7px dot only when it carries a *live* state.
Numbers never get wrapped in a badge (material.md): a `tabular-nums` figure with
an optional status dot reads cleaner.

### 3.9 Selection & elevation — the rule that fixes everything
- **Selection** (tab active, segment active, nav active, row selected, scope
  active): `--surface-3` fill + `--border-strong` + full `--fg` text. **No brand
  flood. No border drop.** Consistent weight in/out → zero layout shift.
- **Elevation** = surface step + shadow step, **together, only for floating
  things**: dialogs (`--shadow-lg`), popovers/dropdowns (`--shadow-md`), the
  SaveDock (`--shadow-md`), the scope palette. Static cards stay flat
  (`--shadow-xs` ≈ a hairline). A shadow on the page means "temporary / above."

---

## 4 · New PageHero Specification

### From first principles
A command surface has two jobs: **state identity** (where am I + the one action)
and **offer control** (navigate + filter). Merging them is the disease. We split
the monolithic `PageHero` panel into two slim zones and **delete the
platinum-railed `.v2-page-header` panel entirely** (it is decorative chrome that
adds height and competes for attention).

### The new vertical rhythm
```
┌───────────────────────────────────────────────────────────────────────────┐
│ SHELL TOPBAR   Sud Italia ▸ Kraków ▸ Orders        ⌘K  ·  ?  ·  ◑  ·  ◔  ⌄ │  ← scope + global
├───────────────────────────────────────────────────────────────────────────┤
│ PAGE HEADER    Orders  ⓘ                                  [ + New order ] ⋯ │  ← IDENTITY  (≈52px, no panel)
├───────────────────────────────────────────────────────────────────────────┤
│ VIEW TOOLBAR   ‹ Kanban  Table ›        Filter (2) · Sort · ⌗ Display      │  ← CONTROL (sticky, attached to data)
├───────────────────────────────────────────────────────────────────────────┤
│ CONTENT        cards / table / board …                                     │
└───────────────────────────────────────────────────────────────────────────┘
                         ┌─────────────────────────────────────────┐
                         │ 3 unsaved   [ Discard ]  [ Save changes ]│  ← SAVEDOCK (only when dirty)
                         └─────────────────────────────────────────┘
```

### Component relationships
```
AdminShell
 ├─ Topbar ── Breadcrumb(▸ ScopeSwitcher)  Search(⌘K)  Help  Theme  Notifications  Account
 ├─ Sidebar (nav.config, role-filtered)
 └─ <main>
     ├─ PageHeader   { title, info?, primaryAction?, overflow? }     ← identity only
     ├─ ViewToolbar  { tabs?, filters?, sort?, display? }            ← control only, sticky
     ├─ {children}   ← Cards / Table / Board
     └─ SaveDock     { state }  (portal, transient)                  ← editors only
```

### Slot rules
- **`PageHeader`**: `title` (serif display, `--text-2xl`, weight 500 — unchanged),
  optional `ⓘ` info (replaces the always-on subtitle — copy moves into a hover/click
  explainer so it doesn't eat vertical space), the single `primaryAction`, and an
  `overflow ⋯` menu for everything else. **No location here. No filters here.**
- **`ViewToolbar`**: optional underline `tabs` on the left; `filter`/`sort`/
  `display` cluster on the right. **Sticky** under the header on scroll so control
  is always reachable in long tables. Omitted entirely on pages with no
  navigation and no filters.
- Both zones are full-bleed slim bars separated by hairlines — **no card, no
  rail, no shadow.** The content cards below are the only boxes on the page.

### Operator workflow this unlocks
1. Glance at the breadcrumb → *I am in Kraków, on Orders.* (identity, always on)
2. Press `⌘L` → reassign scope to "All locations" → every page follows.
3. Tab to **Table**, press `Filter` → add `status: open` → list updates.
4. Edit → the **SaveDock** rises; `⌘S` commits; "✓ Saved" → it retracts.
Nothing competes; each control has exactly one home; the hand never hunts.

---

## 5 · Visual System

The tokens stand. This section is the **application doctrine** — how to use what
already exists, which is where consistency actually lives.

### Surfaces (strict ladder)
| Layer | Token | Use | Floats? |
|---|---|---|---|
| Canvas | `--bg` | the page | — |
| Surface 1 | `--surface-1` | cards, sidebar, header bars | no |
| Surface 2 | `--surface-2` | inputs, inset wells, segmented tracks | no |
| Surface 3 | `--surface-3` | **all selected/active states** | no |
| Hover | `--surface-hover` | hover/press of an interactive surface | no |
> Max **two** nested surfaces visible at once. Three = box-in-box; pull flush.

### Borders
`--border` (`.10` alpha) for dividers/edges; `--border-strong` (`.16`) for
interactive edges, focus, and selection. **One border per box.** Children use
dividers (`border-top`), never a second panel.

### Radius
`xs 4 · sm 6 · md 8 (inputs) · lg 12 (cards) · xl 16 (dialogs) · pill`.
**Buttons stay at 7px** (the investment-grade tightness). Tight, not friendly.

### Elevation / shadows
`xs` = default card (≈ hairline). `sm` = interactive-card hover lift. `md` =
popover/dropdown/SaveDock. `lg` = dialog/sheet. `glow` = focus ring only.
**Neutral only. No tinted glow, ever.** Static content never gets `md`+.

### Spacing
Strict 8px grid (`--space-1 4 … --space-6 32`). Card padding 16; section gap 24;
page gutter 32. No off-grid values — drift is people guessing.

### Typography
- **Display serif** (Fraunces) for page titles and KPI hero numerals only.
- **Inter** for everything else; `tabular-nums` on every digit.
- **JetBrains Mono** for IDs / prices / timers.
- Type scale already defined (`--text-2xs … --text-4xl`). Eyebrows: `--text-2xs`,
  uppercase, `.08–.1em`, `--fg-subtle`.
- **Contrast is non-negotiable:** body text on surface ≥ AA. Inactive controls
  use `--fg-muted`, **not** `--fg-subtle` (the audit's "inactive cities are
  unreadable" bug). Subtle is for eyebrows and metadata only.

### Density
A **density toggle** (Comfortable / Compact) in the `Display` control, persisted.
Tables: 48px comfortable / 36px compact baseline. This is the Stripe move — the
same page serves a franchisee scanning two trucks and a finance team auditing 500.

### Motion
One curve (`cubic-bezier(0.32,0.72,0,1)`). `fast 120` hover/press/focus;
`base 200` ceiling for operational; `slow 320` dialog/dock enter and count-ups.
Reduced-motion → ~0ms, linear. Motion confirms state; it never decorates.

---

## 6 · Before → After (page by page)

**Orders** — *Before:* hero with location pills + status pill-tabs + Kanban/Table
pills all stacked. *After:* breadcrumb scope (Kraków); header `Orders` + `New
order`; toolbar = underline `Kanban / Table` left, `Filter (status, channel,
daypart) · Sort · Display` right; board/table below. Three idioms → one clean
toolbar.

**Inventory** — *Before:* per-page location pills, mixed buttons. *After:* scope
drives the location; toolbar filter chips (`low stock`, `category`); receive/
waste/consume become row actions + one `Receive stock` primary. Aggregate scope
shows a Location column for multi-site stock at a glance.

**Recipes** — *Before:* underline Recipes/Ingredients + ad-hoc buttons; correctly
chain-wide (no location). *After:* **no scope switcher shown** (recipes are
chain-wide, Rule #10 — the breadcrumb reads `Sud Italia ▸ Recipes`, no city);
header `Recipes` + `New recipe`; toolbar tabs Recipes/Ingredients + filter chips
(allergen, health grade). Editing a recipe raises the SaveDock.

**Staff** — *Before:* mixed cards, raw buttons. *After:* scope = location; header
`Staff` + `Hire`; `Roster / Schedule` could split via tabs; clock-in/out as row
actions; labor-cost KPIs in a flat KPI row (selection-as-raise on the active
period segment).

**Reports** — *Before:* dense, bespoke. *After:* scope-aware (single or aggregate);
header `Reports` + `Export`; toolbar = period segmented + compare scope; KPI bands
under eyebrows; `PageExplainer` ⓘ in the header, not a subtitle. Aggregate scope
turns every report into a multi-location benchmark for free.

**Growth (Upsell/Cross-sell/Bundles/Corporate)** — see §7-adjacent migration:
legacy `glass-card`/`glass-input`/raw buttons → `Card`/`Input`/`Button`; the
flagship adopters of the **SaveDock** (they already track dirty state in
`useSellingSettings`). *After:* header `Upsell` + (no parked save); toolbar tabs
`Bundles / Item modifiers`; editing raises the dock; scope sets the location.
This is the page in the original screenshot — it goes from "most-dated island" to
reference-grade.

**Settings** — *Before:* 6 underline sections + 30 cards, lots of toggles.
*After:* header `Settings` (no primary — it autosaves); toolbar tabs General /
Layout / Themes / Security / Audit / Advanced; every toggle is a `Switch` that
**autosaves** with inline "Saved ✓" (no SaveDock here — settings never batch).

---

## 7 · Design-System Governance (survive 10 years, 100 engineers)

> The audit was a *manual* grep. The fix is to make those greps **fail CI**.

### Allowed
- UI primitives **only** from the `src/components/admin/v2/ui` barrel:
  `Button · Card · Badge · Chip · Table · Tabs · Segmented · Select · Input ·
  Switch · Dialog · Popover · Tooltip · Toast · InfoButton · ScopeSwitcher ·
  PageHeader · ViewToolbar · SaveDock · EmptyState · PageLoading · MetricExplainer`.
- Color/space/radius/shadow/motion **only** via `var(--*)` tokens.

### Banned (each with an automated check)
| Banned pattern | Why | Enforcement |
|---|---|---|
| Raw `<button>` / `<input>` / `<select>` in `admin/**` | bypasses primitives | ESLint `no-restricted-syntax` (allow only in `v2/ui/**`) |
| `glass-card` / `glass-input` literals | legacy aliases | ESLint `no-restricted-syntax` on JSX className |
| Inline hex (`#rrggbb`) in `style`/`className` | breaks theming | Stylelint + ESLint regex |
| Icon-only **primary** action | poor affordance | code review checklist + lint hint |
| `--brand*` on a selected/active state | selection≠brand | Stylelint plugin (flag `is-active` rules using brand) |
| Per-page location pill row | scope is shell-level | ESLint ban on importing the retired `LocationFilter` |
| Hand-rolled `<header>` page title | use `PageHeader` | ESLint ban on `.v2-page-header` |

### Enforcement mechanisms (not just rules)
1. **ESLint + Stylelint** rules above — `npm run lint` fails locally and in CI.
2. **A `ds-drift` CI job** that runs the audit's greps (raw button count, hex
   count, glass-* count) and **fails if the number is > 0**. The audit becomes a
   ratchet that can only go to zero.
3. **Required props as a compiler gate** — `PageHeader`, `SaveDock`,
   `MetricExplainer` (already), `EmptyState` make the incomplete build fail
   `tsc`. The type system is the first reviewer.
4. **Storybook + visual snapshots** — every primitive has a story; a
   Chromatic-style snapshot gate blocks unreviewed visual change to `v2/ui`.
5. **CODEOWNERS on `v2/ui/**`, `themes/admin/**`, and the lint config** — a DS
   steward must approve any change to a primitive or a token.
6. **Docs-in-the-same-commit** (Rules #9/#11) — already enforced by convention;
   add a CI check that a `v2/ui` diff touches `docs/design-system/admin/**`.

### How engineers build a page
Never from blank. `npx scaffold admin-page <name>` clones the **golden reference**
(`AdminPurchaseOrders`) → `PageHeader` + `ViewToolbar` + `Card` stack + optional
`SaveDock`, wired to a data hook. Fill the slots; you cannot produce an
inconsistent page because the scaffold only emits primitives.

### How designers propose new patterns — the **Rule of Three** + pattern RFC
- You may **not** ship a one-off control. A new pattern is a **proposal to add a
  primitive** to `v2/ui`, with: a short RFC (problem, why no existing primitive
  fits), a Storybook story, a doc entry, and the `theme/extend.md` contract for
  any new token/variant.
- **Rule of Three:** a pattern used in **3+** places must become a primitive; a
  pattern used **once** must **not** be abstracted. This prevents both drift and
  premature abstraction.
- Reviewed by the DS steward; merged only with story + doc + tokens.

### Component ownership model
- A **Design-System steward** (rotating, named in CODEOWNERS) owns `v2/ui`,
  `themes/admin`, and the lint/CI rules.
- Product engineers own pages; they **compose** primitives and may not fork them.
- Primitive changes are reviewed for cross-surface impact (every consumer), never
  for one page's convenience.

### Migration plan (ratchet to zero)
| Phase | Work | Exit gate |
|---|---|---|
| **0 · Foundations** | Build `ScopeSwitcher`, `PageHeader`, `ViewToolbar`, `SaveDock`, `Segmented`, `PageLoading`; land the lint rules in **warn** mode | primitives shipped + Storybook |
| **1 · Selection fix** | Repoint all `is-active` states to selection-as-raise (kills brand-flood + border-shift) globally via CSS | zero brand-on-selection |
| **2 · Scope** | Replace `LocationFilter` + sidebar `LocationSwitcher` with `ScopeSwitcher`; delete per-page pills | `LocationFilter` import count = 0 |
| **3 · Header split** | Migrate every page from `PageHero` panel → `PageHeader` + `ViewToolbar`; retire `.v2-page-header` | `.v2-page-header` usage = 0 |
| **4 · Growth island** | Upsell/Cross-sell/Bundles/Corporate/SellingShared → `Card`/`Input`/`Button` + SaveDock | `glass-card`/`glass-input` = 0 |
| **5 · Tokens + buttons** | Sweep ~36 hex → tokens; raw `<button>` → `Button` | `ds-drift` job = 0; flip lint to **error** |
| **6 · Lock** | CI `ds-drift` blocking; CODEOWNERS; scaffold required | green build = consistent build |

Order matters: **selection fix (Phase 1) delivers ~70% of the perceived
improvement on day one** because it touches every control at once.

---

## 8 · Final Verdict

After this redesign, an operator opens `/admin` and the product **disappears**.
The breadcrumb tells them where they are and whose numbers they're reading; one
primary button tells them the one thing to do; a single toolbar holds every
control in the same place on every page; selecting a tab raises it a half-step
without a flash of color; editing summons a calm dock that commits with `⌘S` and
melts away. Nothing competes. Nothing shifts. Nothing decorates.

It will read as **flat planes separated by hairlines, with depth reserved for the
few things that float** — the restraint of Apple, the density of Stripe, the
clarity of Linear, the workflow of Ramp, the consistency of Vercel. A franchisee
with two trucks and a finance team auditing five hundred use the *same* surface at
different densities and scopes.

And critically: it **stays** that way. The governance layer — lint, CI ratchet,
required props, CODEOWNERS, scaffold, Rule of Three — means the 100th engineer
ships the same quality as the design-system steward, because the system makes the
inconsistent thing impossible to build, not merely discouraged.

When an operator from McDonald's, Starbucks, Domino's, Sweetgreen, FC Barcelona,
or the Olympic Committee opens it, they won't say "nice UI." They'll say:

> *"This feels like institutional software."*

That is the whole brief.

---

*Companion to `docs/audits/2026-06-05-admin-subpages-analysis.md`. New primitives
land with their `docs/design-system/admin/**` docs (Rule #11) and a
`/admin/capabilities` entry where operator-visible (Rule #9).*
