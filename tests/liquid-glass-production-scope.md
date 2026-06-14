# Liquid Glass — Production Migration Scope

**Status:** P0 (foundation) shipped · P1–P5 not started
**Decisions (2026-06-14):** clean replacement · full storefront in phase 1 · this doc committed

### P0 — Foundation — ✅ DONE
Shipped: glass material `:root` vars + `body::before` aurora (`v8-aurora`) +
`.v8-surface` / `.v8-surface-strong` / `.v8-surface-dark` / `.v8-sheen`
primitives + `@supports not (backdrop-filter)` fallback in
`themes/homepage/index.css`. Docs: rewrote `theme/material.md` (canvas /
elevation / shadows / rules / "what this is not"), updated `theme/color.md`
(rules #2–3, parchment-rule, shadow row), added **`theme/extend.md`** (new),
documented the primitive in `theme/components.md`, refreshed both READMEs.

**Refinements vs. the original plan (§3):**
- Glass vars live as **plain `:root` vars in `index.css`** (next to
  `--shadow-*`), **not** in `tokens.css` `@theme` — they're read by raw CSS,
  not minted as Tailwind utilities. Same pattern as the shadow ramp.
- **`theme.ts` untouched** — no new *colours* (the aurora reuses ochre/
  terracotta/basil/oxblood); glass fills are material alphas, not palette
  hues, so the JS mirror doesn't need them.
- `color.md` got **rule rewrites**, not new token-table rows (consistent with
  the above — glass fills aren't palette colours).
- Aurora moved the parchment base to **`<html>`** + a **fixed `body::before`**
  layer (z-index −1) to guarantee it shows through the transparent body —
  avoids the opaque-body / negative-z-index invisibility trap.
**Mockups this is based on:**
- `tests/sketches/sud-italia-liquid-glass.html` (hero · locations · famiglia, before/after)
- `tests/sketches/sud-italia-liquid-glass-pages.html` (location · cart · confirmation, parchment⇄glass toggle)

> This is an R&D planning note (lives in `/tests/`, out of the shipped bundle).
> It is **not** a `docs/design-system/` doc and **not** a dated `docs/audits/`
> snapshot. The design-system docs get edited *in lockstep with the code* as
> each phase lands (Rule #11), not here.

---

## 1. What this is (and isn't)

**Is:** a **material-layer** change to the self-contained Homepage theme. The
warm Tuscan **palette is reused 100%** (parchment, terracotta, basil, oxblood,
ochre, espresso). What changes is *how surfaces are rendered* — flat
parchment/white → translucent backdrop-blur glass over a living aurora.

**Isn't:** a recolor, a content change, or a copy rewrite. Every headline,
ornament (basil/stain/tomato), pen-sketch (Kraków oven, Warszawa Vespa),
tricolore, and the bilingual EN/IT voice stays exactly as shipped.

**Clean replacement** (chosen): Liquid Glass becomes THE storefront material.
Parchment is **not** kept as a parallel theme — it survives **only** as the
degraded fallback for `prefers-reduced-motion` and browsers without
`backdrop-filter` (see §6). No settings flag, no A/B; one cutover per phase.

---

## 2. The doctrine this reverses

`docs/design-system/homepage/theme/material.md` today states the parchment
doctrine explicitly. Liquid Glass inverts exactly these three lines, so
`material.md` is the **primary doc rewrite**:

| Today (`material.md`) | Liquid Glass |
| --- | --- |
| "Section backgrounds stay flat parchment / parchment-deep / white." | Sections sit over a fixed **aurora** layer; surfaces are translucent glass that lets it bloom through. |
| "The parchment / white alternation IS the elevation." | Elevation = blur depth + refraction edge + layered warm shadow. |
| "No brand-tinted glows, no multi-layer drop shadows." | Brand-tinted glows + multi-layer shadows are the core of the look (still disciplined, not neon). |

Everything else in `material.md` (radius scale, motion budget, hairlines)
largely **survives**; radius nudges up slightly, motion gains the aurora +
sheen but stays within the existing "delightful, not busy" budget.

---

## 3. Architecture: a glass primitive layer (not 1,186 hand-edits)

`index.css` is **9,161 lines / ~1,186 `.v8-*` rules / 38 families**. We do
**not** touch most of them. Strategy:

### 3a. New tokens — `tokens.css` (+ `theme.ts` mirror, kept in sync per its own rule)
```
--glass-fill            rgba(248,239,222,.50)   /* translucent parchment */
--glass-fill-strong     rgba(248,239,222,.62)   /* drawers, foot bars */
--glass-stroke          rgba(255,250,238,.60)   /* refraction border */
--glass-shadow          rgba(61,40,23,.30)      /* warm drop */
--blur-surface          22px                    /* backdrop blur radius */
--blur-chrome           14px                    /* nav / sticky bars */
--aurora-*              ochre/terracotta/basil/oxblood radial stops
```
Every token added here lands with a matching **row in `color.md`** and a
**swatch-accurate constant in `theme.ts`** in the same commit.

### 3b. Shared surface primitives — top of the surface section in `index.css`
- `.v8-surface` recipe: `--glass-fill` + `backdrop-filter: blur() saturate()`
  + `--glass-stroke` border + layered shadow + refraction `::before`
  top-edge highlight ([LG-3]).
- `.v8-sheen` hover sweep ([LG-4]) — opt-in on cards/CTAs.
- `body` aurora + morphing blob layer ([LG-1]/[LG-5]) replacing the
  paper-grain washes; grain optionally retained at very low alpha for tooth.

### 3c. Re-point the ~12 surface families (the actual edit list)
Only families that paint a surface change. Inventory:

| Family | Surface | Notes |
| --- | --- | --- |
| `v8-loc-card` | location cards | glass + sheen; oven/Vespa tile gets caustic shimmer [LG-6] |
| `v8-mi` | menu item cards | **perf-critical** — long lists, see §6 |
| `v8-cart*` | cart drawer + foot | strong-fill glass; already portalled (Rule #4 ✓) |
| `v8-detail` | item detail drawer | portalled glass |
| `v8-bundle(s)` / `v8-combo(s)` | offer cards/banners | glass |
| `v8-rewards` / `v8-soci` | loyalty surfaces | dark-espresso variant → tinted glass |
| `v8-order` | confirmation / tracker | glass card + check medallion shimmer |
| `v8-nav` / `v8-float` | sticky nav + floating cart | chrome blur (`--blur-chrome`) |
| `v8-hero` | hero block | glass headline panel + aurora |
| `v8-ps` | section shells | aurora-aware, mostly background change |

**Untouched** (no surface paint): `v8-tricolore`, `v8-pulse`, `v8-mi-chip`,
`v8-mi-flag`, `v8-page`, text/typography rules, `v8-skel`, `v8-wax`, etc.

---

## 4. Phase plan (full storefront, build order)

Each phase = code + design-system doc edit + verify, in one reviewable unit.

- **P0 — Foundation.** Glass tokens (`tokens.css`/`theme.ts`), `.v8-surface`/
  `.v8-sheen` primitives, body aurora + reduced-motion/@supports fallback.
  Docs: rewrite `material.md`, extend `color.md`, **add `theme/extend.md`**
  (the "how to add a glass surface" contract — admin has one, homepage doesn't).
- **P1 — Landing.** `v8-hero`, `v8-ps`, `v8-loc-card`, `v8-bundles`,
  `v8-famiglia`, `v8-soci`. Docs: `pages/home.md`.
- **P2 — Location / menu.** `v8-mi` (perf pass), `v8-menu`, `v8-cat`,
  location hero, `v8-guarantee`, `v8-float`. Docs: `pages/menu.md`.
- **P3 — Cart / checkout.** `v8-cart*`, `v8-detail`, `v8-combo`,
  `v8-address`, `v8-composer`. Docs: `pages/checkout.md`.
- **P4 — Order + rewards.** `v8-order`, `v8-rewards`. Docs: `pages/order.md`,
  `pages/loyalty.md`.
- **P5 — Chrome + polish.** `v8-nav`, `v8-switcher`, `v8-back`, `v8-pfoot`,
  `v8-abandoned`, `v8-surprise`, `v8-chat`. Cross-page QA.

---

## 5. Documentation obligations (Rule #11 — ships with code, every phase)

- `theme/material.md` — **rewrite** the paper-canvas, elevation-ramp, shadow
  sections (the heart of the change).
- `theme/color.md` — **add** glass-token rows.
- `theme/components.md` — document `.v8-surface` / `.v8-sheen` primitives.
- `theme/extend.md` — **new file** — the glass-surface contract.
- `theme/philosophy.md`, `typography.md` — touch only if claims drift.
- `pages/{home,menu,checkout,order,loyalty}.md` — update "Live code" notes +
  any material descriptions per phase.
- `grep docs/design-system/homepage` after each phase for stale path pointers
  / orphan rows (delete + rename failure modes called out in Rule #11).

**Rule #9:** clean replacement with **no settings flag** = no new operator-
configurable capability, so **no `/admin/capabilities` entry required**. (If we
ever reintroduce a flag, that flips and a capability row is mandatory.)

---

## 6. Risks & mitigations

- **`backdrop-filter` perf on long lists.** The menu grid (`v8-mi`) can render
  20–40 blurred cards. Mitigation: cap blur radius, consider
  `content-visibility: auto` on off-screen cards, test on mid-tier Android;
  fall back to opaque parchment-tint fill if a frame-budget regression shows.
- **Text contrast over translucency.** Body copy must hold **WCAG AA** over the
  glass fill at its lightest. Mitigation: `--glass-fill` alpha floor of ~0.5,
  text stays `--espresso`/`--ink`; audit with a contrast checker per surface.
- **Reduced-motion + unsupported browsers (the only surviving parchment use).**
  `@media (prefers-reduced-motion: reduce)` → no aurora drift/sheen.
  `@supports not (backdrop-filter: blur(1px))` → opaque parchment fill +
  flat shadows (i.e. today's look). This is the documented fallback, not a
  second theme to maintain.
- **Portal stacking (Rule #4).** Cart/detail already `createPortal` to
  `document.body` ✓ — glass adds no new fixed-position traps, but re-verify
  after the chrome-blur pass.
- **SSR/hydration.** Aurora/blobs are CSS-only (no JS state) → no
  hydration mismatch. The existing mount-gated status pills are unaffected.

---

## 7. Rough size

- `index.css`: net **new** ~250–350 lines (primitives + aurora + fallbacks);
  **edited** ~12 surface families (re-point fills/borders/shadows). The other
  ~26 families and the bulk of the 1,186 rules are untouched.
- `tokens.css` +~12 lines · `theme.ts` +~12 constants.
- Docs: ~6 files edited + 1 new (`extend.md`).
- Verification: visual pass per phase + mobile perf spot-check on P2.

---

## 8. Open questions for later phases

1. Keep a faint paper-grain *over* the aurora for tooth, or pure gradient?
   (Mockups drop grain in glass mode; a 3–4% grain may read warmer.)
2. Dark loyalty surfaces (`v8-rewards`/`v8-soci` espresso blocks) — tinted
   **dark** glass, or flip to light glass? (Mockup uses dark-tinted.)
3. Hero: glass *panel* around the headline (mockup) vs. headline floating
   directly on the aurora? Panel is safer for contrast.
