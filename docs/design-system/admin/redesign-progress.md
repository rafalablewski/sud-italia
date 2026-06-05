# Admin Redesign — Live Progress Tracker

> **Single source of truth for "where are we in the redesign right now."**
> Companion to the strategy (`redesign-blueprint.md`) and the audit
> (`../../audits/2026-06-05-admin-subpages-analysis.md`). Update this file in the
> **same commit** as any redesign work — it is the operator's map of the migration.

**Current phase:** `Phase 0 — Foundations` ✅ complete (primitives + lint shipped)
**Last updated:** 2026-06-05
**Branch:** `claude/admin-subpages-analysis-1bsjz`

---

## Phase ledger (from the blueprint §7 migration plan)

| Phase | Title | Status | Exit gate |
|---|---|---|---|
| **0** | Foundations — new primitives + lint (warn) | ✅ **complete** | primitives shipped + documented |
| 1 | Selection fix (selection-as-raise, no brand flood) | ⬜ not started | zero brand-on-selection |
| 2 | Scope — replace LocationFilter + sidebar switcher | ⬜ not started | `LocationFilter` import count = 0 |
| 3 | Header split — PageHero → PageHeader + ViewToolbar | ⬜ not started | `.v2-page-header` usage = 0 |
| 4 | Growth island → Card/Input/Button + SaveDock | ⬜ not started | `glass-card`/`glass-input` = 0 |
| 5 | Tokens + buttons sweep | ⬜ not started | `ds-drift` job = 0; lint → error |
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

## ▶ Next up — Phase 1 (Selection fix)
Repoint every legacy `.is-active` that brand-floods to selection-as-raise. The
big one is `.v2-locpill.is-active` (the audit's headline offender) — but since
Phase 2 replaces `LocationFilter` wholesale with `ScopeSwitcher`, Phase 1 can
focus on any *other* brand-on-selection states (and confirm the underline-tab
2px brand accent is the only sanctioned brand-as-state). Exit gate: zero
brand-fill selection states outside the sanctioned underline accent.
