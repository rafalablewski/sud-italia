# Admin Redesign — Live Progress Tracker

> **Single source of truth for "where are we in the redesign right now."**
> Companion to the strategy (`redesign-blueprint.md`) and the audit
> (`../../audits/2026-06-05-admin-subpages-analysis.md`). Update this file in the
> **same commit** as any redesign work — it is the operator's map of the migration.

**Current phase:** `Phase 5 — Tokens + buttons sweep` 🟡 in progress (material closeouts done; raw-element + chart-hex sweep remaining)
**Last updated:** 2026-06-05
**Branch:** `claude/admin-subpages-analysis-1bsjz`

---

## Phase ledger (from the blueprint §7 migration plan)

| Phase | Title | Status | Exit gate |
|---|---|---|---|
| **0** | Foundations — new primitives + lint (warn) | ✅ **complete** | primitives shipped + documented |
| 1 | Selection fix (selection-as-raise, no brand flood) | ✅ **complete** | zero brand-on-selection |
| 2 | Scope — replace LocationFilter + sidebar switcher | ✅ **complete** | `LocationFilter` import count = 0 |
| 3 | Header split — PageHero → PageHeader + ViewToolbar | ✅ **complete** | `.v2-page-header` usage = 0 |
| 4 | Growth island → Card/Input/Button + SaveDock | ✅ **complete** | `glass-card`/`glass-input` = 0 (family) |
| 5 | Tokens + buttons sweep | 🟡 **in progress** | `ds-drift` job = 0; lint → error |
| 6 | Lock — CI blocking, CODEOWNERS, scaffold | ⬜ not started | green build = consistent build |

Legend: ⬜ not started · 🟡 in progress · ✅ done · ⏸️ blocked

---

## Phase 0 — Foundations · task board

Goal: ship the new primitives the later phases depend on, **without** ripping out
anything yet (no page migrations in Phase 0 — those are Phases 2–4). New
primitives coexist with the existing ones until their migration phase.

### Primitives
| Primitive | File | CSS | Barrel | Docs | Status |
|---|---|---|---|---|---|
| `PageLoading` | `v2/ui/PageLoading.tsx` | reuses `.v2-page-loading` | ✅ | ✅ | ✅ |
| `Segmented` | `v2/ui/Segmented.tsx` | `.v2-seg` | ✅ | ✅ | ✅ |
| `PageHeader` | `v2/ui/PageHeader.tsx` | `.v2-pagehead` | ✅ | ✅ | ✅ |
| `ViewToolbar` | `v2/ui/ViewToolbar.tsx` | `.v2-toolbar` | ✅ | ✅ | ✅ |
| `SaveDock` + `useSaveState` | `v2/ui/SaveDock.tsx` | `.v2-savedock` | ✅ | ✅ | ✅ |
| `ScopeSwitcher` | `v2/ui/ScopeSwitcher.tsx` | `.v2-scope` | ✅ | ✅ | ✅ |

All six exported from `v2/ui/index.ts`; CSS in `src/app/themes/admin/index.css`
(clearly delimited "ADMIN REDESIGN — Phase 0 primitives" block). `tsc --noEmit`
passes; the menu-row helper class `.v2-menu-item` also shipped for `PageHeader`'s
overflow.

### Governance
| Task | Where | Status |
|---|---|---|
| Lint: ban raw `<button>/<input>/<select>` in admin (warn) | `eslint.config.mjs` | ✅ |
| Lint: ban `glass-card`/`glass-input` literals (warn) | `eslint.config.mjs` | ✅ |
| Lint: ban inline hex in admin JSX (warn) | `eslint.config.mjs` | ✅ |
| Doc the new selection-as-raise doctrine | `theme/material.md` | ✅ |
| Doc the new primitives | `theme/components.md` | ✅ |

Rules are **warn-only** and scoped to the admin page layer (`src/app/admin/**` +
`src/components/admin/*.tsx`; the `v2/` infrastructure and shell chrome are
excluded). Verified: 0 errors introduced repo-wide; warnings fire as expected.

### Ratchet baseline (the `ds-drift` numbers Phase 5 must drive to 0)
Captured 2026-06-05 via `eslint src/app/admin src/components/admin/*.tsx`:

| Pattern | Warnings |
|---|---|
| raw `<button>` | 148 |
| raw `<input>` | 50 |
| raw `<select>` | 11 |
| `glass-*` class | 73 |
| inline hex (6-digit) | 17 |

These only go down. Phase 5 flips the rules to `error` once they reach 0.

### Deviations from the blueprint exit gate
- **Storybook is deferred.** The repo has no Storybook and standing one up for
  Next 16 / React 19 / Tailwind 4 is a Phase-of-its-own. Phase 0 substitutes
  **doc-driven examples** in `components.md` + the planned `ds-drift` test ratchet
  (Phase 5/6) as the consistency gate. Storybook/visual-regression is re-scoped
  into Phase 6 (Lock). Recorded here so the gate change is explicit, not silent.

---

## Decisions & notes (chronological)
- **2026-06-05** — Phase 0 kicked off. Confirmed via code read: the existing pill
  `Tabs` already uses selection-as-raise (`surface-1` + `shadow-xs`), so the real
  brand-flood offender is `.v2-locpill` only — `ScopeSwitcher` retires it.
  `Location` has no `region`/`market` field yet, so `ScopeSwitcher` ships
  flat-with-search; region grouping is a documented future enhancement gated on
  adding that metadata to the locations store.
- New primitives are **additive** in Phase 0 — existing `PageHero` / `Tabs` /
  `LocationFilter` stay live until Phases 2–4 migrate pages onto the new ones.
- **Phase 0 complete (2026-06-05).** Six primitives + warn-mode lint + docs
  shipped. `tsc` clean, lint 0 errors. Ratchet baseline recorded above.

## Phase 1 — Selection fix · done (2026-06-05)
Repointed every in-scope brand-flood `.is-active` / `.is-selected` to
selection-as-raise (`--surface-3` + `--border-strong` + full `--fg`), CSS-only in
`src/app/themes/admin/index.css`:

| Rule | Was | Now |
|---|---|---|
| `.v2-locpill.is-active` | brand-soft + border-drop (headline offender) | surface-3 + border-strong |
| `.v2-chip.is-selected` | brand-soft + brand border | surface-3 + border-strong |
| `.v2-tabs-pill .v2-tab.is-active .v2-tab-count` | brand-soft/brand | surface-3/fg-muted |
| `.v2-palette-item.is-active .v2-palette-item-icon` | brand-soft/brand | surface-1/fg |
| `.v2-m-icon-btn.is-active` | brand-soft/brand | surface-3/fg |
| `.v2-m-chip.is-active` | brand-soft + brand border/text | surface-3 + border-strong/fg |
| `.v2-m-list-row.is-selected` | brand-soft | surface-3 |
| `.v2-m-bottom-nav-item.is-active` | brand color **+ forbidden brand glow drop-shadow** | fg color, glow removed |

**Exit gate met:** the only brand-as-state left is the sanctioned 2px `--brand`
underline on an active underline tab. Verified via
`grep "is-active|is-selected" … | grep brand` → only the underline accent + the
out-of-scope `/core` POS rules remain. `tsc` + build clean.

**Deferred to Phase 5 (material/token sweep — NOT selection states, so out of
Phase 1 scope, logged so they're not lost):**
- `.v2-m-btn-primary` carries a brand-tinted `box-shadow` (button-doctrine says no
  tinted shadows).
- `.v2-m-notif-row.is-unread .v2-m-notif-dot` has a brand ring glow (status
  indicator — review whether to keep as intentional unread emphasis).

## Phase 2 — Scope · done (2026-06-05)
Collapsed the dual-switcher model (per-page `LocationFilter` + sidebar
`LocationSwitcher`) into **one shell-level scope** = the existing persisted
`useAdminLocation()` context, surfaced as `ScopeSwitcher` in the topbar breadcrumb.

**Shell:** `ScopeSwitcher` added to `Topbar` (breadcrumb, `includeAll`, wired to
`useAdminLocation`); `LocationSwitcher` removed from `Sidebar` footer.
**PageHero:** `location` slot + `LocationFilter` import + `.v2-hero-find` row removed.
**Pages migrated to read site from the scope (drop per-page filter):**
- Operational (derive `pageLoc` from scope, `"all"`→first truck): HACCP, Waste,
  Handover, Cash, Truck, Inventory, Schedule, Purchase orders.
- `AdminUsers` (list filter `locFilter` → `scope`).
- Selling family via `useSellingSettings` (`activeLocation` now derives from scope):
  Upsell, Cross-sell. `AdminScheduledBundles` (own state → scope).
**Deleted:** `v2/ui/LocationFilter.tsx`, `v2/LocationSwitcher.tsx`, their CSS
(`.v2-locscroll*`, `.v2-locpill*`, `.v2-loc-trigger/menu/option/*`), barrel export.
**Docs (Rule #11):** components.md (Location→Scope section rewrite, sidebar footer,
hero row, ScopeSwitcher entry), extend.md (location guidance), sections/people.md
+ finance.md headers. (mobile/audit.md is RETIRED/historical — left as-is; the one
`/core` components.md mention is an incidental CSS-reset note, out of scope.)

**Exit gate met:** `grep -rn LocationFilter src --include=*.tsx` → 0 imports
(only JSDoc prose mentions remain). `tsc` + `npm run build` clean.

**Data-flow verified (Rule #8):** topbar `ScopeSwitcher` → `setLocation` →
localStorage + context → each page's `globalLoc`/`scope` → keyed fetch effect
re-runs → data re-scopes. Operational pages can't show "all" (fall back to first
truck); aggregate-capable pages (Users) honour "" = all.

## Phase 3 — Header split · done (2026-06-05)
**Approach (deliberate, low-risk):** instead of hand-migrating ~40 `PageHero`
call sites (huge diff, high regression risk, no per-page visual QA possible here),
I **rewrote `PageHero` itself to compose `PageHeader` + `ViewToolbar`**. Every
page gets the slim identity/control split with **zero call-site changes**, and the
`.v2-page-header` panel stops being rendered. New pages should call the two
primitives directly (documented).

**`PageHero` mapping:** `title`→PageHeader title · `subtitle`→PageHeader `info`
(ⓘ popover, off the bar) · `actions`→`primaryAction` · `nav`→ViewToolbar underline
tabs · `filter`→pill `Tabs` in the toolbar (pure relocation — keeps overflow
scroll, zero behaviour change) · `dropdowns`→`Select`s. Prop signature unchanged,
so all call sites compile + render the new surface untouched.

**Also fixed:** `AdminCustomerDetail` hand-rolled a raw `.v2-page-header` in its
loading state → replaced with `<PageLoading name="customer" />`.

**CSS:** the hero panel CSS (`.v2-page-header` / `.v2-page-title` /
`.v2-page-subtitle`) is **retained** because the `/core` KDS header still
references it (out of scope — deleting it could break core, which I can't verify
here). It's dead-for-admin; the comment above it + the components.md note record
this. The `.v2-hero*` rules are dead-for-admin legacy, flagged for a later tidy.

**Docs (Rule #11):** components.md ("Page command surface" section rewritten,
"Redesign primitives" heading + intro updated, stale anchors repointed across
components.md + material.md), the `.v2-page-header` CSS comment, and this tracker.

**Exit gate met:** `grep -rn "v2-page-header" src --include=*.tsx` → only a JSDoc
prose mention in `PageHero.tsx` (no className usage). `tsc` + `npm run build` clean.

**Known interim trade-off:** subtitles (incl. live hints like Upsell's dirty
count) now sit behind the ⓘ. Acceptable; Phase 4 gives the Growth editors a
`SaveDock` so the dirty state is surfaced properly.

## Phase 4 — Growth island · done (2026-06-05)
Retired the legacy `glass-*` (old `--admin-*` token system) from the Growth island
and gave its editors the `SaveDock`.

**Discovery that shaped the approach:** `.glass-card`/`.glass-input` are **not**
aliases of `.v2-card`/`.v2-input` — they're the older `--admin-*`-token system. So
the migration is a real token modernization, not a no-op. Given the volume (~60
inputs, 7 of them `<select>`) and no visual-QA here, I did a **safe class-swap to
the canonical v2 classes** (`glass-card`→`v2-card`, `glass-input`→`v2-input`) —
zero tag-matching risk, visually correct (same classes the `Card`/`Input`
components emit), clears the `glass-*` lint. Converting these raw `<input>`/
`<select>` to the `Input`/`Select` *components* (and removing raw elements) is the
same work as Phase 5's raw-element sweep, so it's folded there.

**Files migrated (glass-* → 0):** AdminUpsell, AdminCrossSell, AdminScheduledBundles,
AdminCorporate, AdminSellingShared — **plus the island's sub-components** rendered
by Upsell/Cross-sell: MLUpsellPanel, ModifierInventory, BundleAnalyticsCard.

**SaveDock:** Upsell + Cross-sell dropped the parked icon-only header Save and now
drive a bottom-centre `SaveDock` from the hook (`dirty=isDirty`,
`status=saving?…:saved?…:idle`, `count=dirtyLocations.size`, `onSave=handleSave`).
The subtitle dirty-hint (which had been pushed behind the Phase-3 ⓘ) is replaced by
the dock's live "N unsaved changes". Also removed the now-unused `activeLocation`
destructure in Cross-sell.

**Exit gate met:** `grep glass-(card|input)` across the family + sub-components → 0.
`tsc` + `npm run build` clean. Global `glass-*` ratchet: **73 → 1** (only
`/admin/capabilities/page.tsx`, a System page — swept in Phase 5).

**Docs (Rule #11):** extend.md ("Add a page" guidance → v2/ui primitives, not
glass-*), components.md (Inputs + General card legacy notes), material.md (drop the
`.glass-card` mention), and this tracker.

**Note on `.v2-card` vs legacy `.glass-card`:** v2-card adds `display:flex;
flex-direction:column; overflow:hidden` (the proven standard across the rest of
admin). Portaled overlays (Dialog/Popover/Tooltip) are unaffected by `overflow`;
the island's dropdowns are native `<select>` or portaled, so no clipping risk.

## Phase 5 — Tokens + buttons sweep · 🟡 partial (2026-06-05)

### Done this pass — material closeouts + the governance lock
- **`glass-*` → 0 across all admin** — cleared the last `glass-card`
  (`/admin/capabilities`). The legacy glass system is fully retired from admin.
- **Brand-tinted shadows removed** (the two Phase-1-deferred material violations):
  `.v2-m-btn-primary` box-shadow → neutral `--shadow-xs`; `.v2-m-notif-row.is-unread`
  dot → dropped the brand glow ring. Admin now has **no coloured glow shadows**.
- **Governance: flipped the DS lint rule `warn → error` + bulk-suppressions ratchet**
  (your "refine governance" decision). `eslint-suppressions.json` grandfathers the
  226 existing page-layer violations (raw `<button>`/`<input>`/`<select>` + the 17
  chart-hex); the count can only shrink. **New drift now fails `npm run lint`**
  (verified: injecting a raw `<button>` errors; revert is clean). Legitimately-raw
  elements use `// eslint-disable-next-line no-restricted-syntax -- ds-ok: <reason>`.
  Documented in `theme/extend.md` → "Design-system governance — the lint ratchet".
- `tsc` + `npm run build` clean (build doesn't lint; CI/`npm run lint` enforces).
  Note: one **pre-existing, out-of-scope** lint error remains in
  `scripts/legacy/verify-scalability-fixes.ts` (a `require()` import — not admin UI,
  not touched here).

### NOT done — the raw-element + chart-hex sweep (deliberately deferred)
This is the large, **visually-affecting** half, and it cannot be done safely in a
single blind pass (no visual QA here; a bad mass-convert would break forms, charts
and interactions across the whole admin, and flipping lint to `error` while any
remain would **fail `next build`**). Current ratchet:

| Pattern | Count | Why it's careful work, not a mechanical swap |
|---|---|---|
| raw `<button>` | 148 | Most carry bespoke styling; `<Button>` restyles them — visual change per site |
| raw `<input>` | 50 | `<Input>` adds a `.v2-input-wrap`; width/flex classes must move to the wrapper |
| raw `<select>` | 11 | → `<Select>` needs an `options` array + loses/【changes】the chevron |
| inline hex | 17 | All **chart/heatmap palettes** that *drift from* the DS rule (color.md says charts use the centralized `theme.ts` `chart` palette + single-hue ramps). Fixing them **changes chart colours** → needs QA. Many live in the 17k-line `AdminSimulation`. |

**Lint stays at WARN** (the ratchet keeps surfacing these); the **warn → error flip
is gated on reaching zero** and moves to Phase 6.

### Recommended way to land the rest (needs a decision — see chat)
1. **Per-file, with visual QA** — convert one file at a time, you eyeball each, I
   build between. Safest, slowest. OR
2. **Refine governance** — accept that not every `<button>` is a `<Button>`
   (interactive cards, toggles, table-row actions are legitimately raw); allow
   *annotated* raw elements (`// ds-ok: <reason>`) and reserve the primitives for
   genuine action buttons / form fields. Then the ratchet targets only true drift.
3. **Charts** — centralize every chart palette into `theme.ts` `chart` (the DS
   already mandates it) + single-hue ramps; verify each chart re-renders.

## ▶ Next up — Phase 6 (Lock) + finish Phase 5 sweep
Per the decision above: complete the raw-element + chart-hex sweep to zero, then
flip lint **warn → error**, add the CI `ds-drift` job, CODEOWNERS on
`v2/ui`/`themes/admin`/lint config, and the `scaffold admin-page` generator.
