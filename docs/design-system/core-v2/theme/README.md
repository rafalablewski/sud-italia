# Core v2 — Theme

The clean-room theme for `/core-v2/*`. One stylesheet, one scope, zero
admin inheritance.

- **Live code:** `src/app/themes/core-v2/index.css` (`@import`s
  `tokens.css`). Loaded **only** by `src/app/core-v2/layout.tsx` — no
  admin `base/index.css`, no `suite.css`.
- **Scope:** everything sits under `.cv2` (the layout wrapper) or the
  `cv-` class prefix, so it can never leak into Admin, Homepage, or the
  current `/core`.
- **Fonts:** the layout's own `next/font` instances — `--font-cv-display`
  (Bricolage Grotesque, `opsz` axis) · `--font-cv-ui` (Inter) ·
  `--font-cv-mono` (JetBrains Mono). No `--font-admin-*`.

## Tokens

Defined per-mode on `.cv2[data-theme="dark|light"]` in `tokens.css`.
**Dark is the default** (the bare `.cv2` block = dark) for night trucks +
kitchen glare; light is the option. The theme toggle
(`CoreV2ThemeToggle`) writes `data-theme` on the `.cv2` root and persists
to `localStorage["cv2-theme"]`; a pre-paint script in the layout applies
the saved choice without a flash.

| Group | Tokens |
| --- | --- |
| Surfaces | `--bg` · `--panel` · `--panel-2` · `--panel-3` · `--hover` |
| Ink | `--ink` · `--ink-2` · `--ink-3` |
| Lines | `--line` · `--line-2` |
| Brand | `--brand` · `--brand-bright` · `--brand-ink` · `--brand-wash` |
| Semantic | `--basil` · `--amber` · `--info` · `--danger` (+ each `*-wash`) |
| Elevation | `--sh-1` · `--sh-2` · `--sh-pop` |
| Type | `--display` · `--ui` · `--mono` |
| Radius | `--r-sm` 7 · `--r-md` 10 · `--r-lg` 14 · `--r-xl` 20 · `--pill` |
| Motion | `--fast` · `--base` |

KDS will override the surface/ink tokens to a fixed dark wall regardless
of `data-theme` (its own scope, landing in Step 4).

## Material

Flat. 1px hairlines (`--line` / `--line-2`), crisp small shadows
(`--sh-1` / `--sh-2`), no glass / gradient / glow. That's the deliberate
line between Core (crisp) and Admin (glass) — see the design-language
decisions in [`../README.md`](../README.md).

## Components (class reference)

The shell + shared primitives, all `cv-` prefixed. Anatomy of each
surface lives in [`../modules/`](../modules/).

### Shell (`CoreV2Shell` · `src/core-v2/shell/`)

- **`.cv-bar`** — command bar (row 1): `.cv-brand` (mark + wordmark) ·
  `.cv-switch` (the segmented surface switcher, `CoreV2Nav`) ·
  `.cv-right` (global actions).
- **`.cv-switch a`** — a surface tab; `.on` = active (pathname-derived).
- **`.cv-sub`** — context subbar (row 2): `.cv-eyebrow` + `.cv-tabs`
  (the surface's view tabs) + `.cv-sp` spacer + the surface's own
  controls (passed as `subRight`).
- **`.cv-body`** — the surface body; `.bleed` lets a surface paint its
  own full-bleed background (KDS).

### Global-action primitives

- **`.cv-chip`** — pill (location chip, status, a `Dine-in` flag).
  `.dot` = a small status dot. `.on` = filled brand (active toggle);
  `.danger` = destructive variant (red wash → solid red on hover, e.g. POS
  *Void*); `:disabled` dims it.
- **`.cv-iconbtn`** — 34px square icon button (theme toggle, fullscreen).
- **`.cv-clock`** — the mono HH:MM clock.
- **`.cv-tabs a/button`** — subbar view tabs; `.on` = active.
- **`.cv-seg button`** — a segmented filter (KDS stage filter, etc.).

### Scaffold

- **`.cv-scaffold`** — the honest "surface scaffolded, wiring in Step N"
  panel (`ScaffoldSurface`) shown while a surface's chrome is live but
  its guts are ported in a later step. `.ic` icon chip · `h2` · `p` ·
  `.step` pill.

### POS

`.cv-pos` grid (rail · menu · ticket): `.cv-rail` + `.cv-cat` category
buttons · `.cv-menu` + `.cv-menu-grid` + `.cv-prod` cards (`.pn` name ·
`.pd` desc · `.cv-tagrow`/`.cv-tag` · `.pp` price · `.add`) · `.cv-ticket`
+ `.cv-ticket-empty` (the no-open-check state). Full anatomy:
[`../modules/pos.md`](../modules/pos.md).

## Reset specificity (a recurring trap — read this)

A scoped reset must never out-rank the components it resets. The footgun:
a reset written as `.cv2 button { background: none; border: 0; padding: 0 }`
has specificity **(0,1,1)** — higher than a single-class control like
`.cv-prod` **(0,1,0)** — so it silently strips the panel / border /
padding off every button. (This is the same bug that lives in the old
`/core`: `.core-suite * { margin: 0; padding: 0 }` at suite.css:81 zeroes
the padding of any shared `src/ui` control or Tailwind utility dropped
inside a Core surface, because it ties at (0,1,0) and wins on source
order.)

Two defences, both applied here:

1. **The reset is wrapped in `:where()`** so its scope contributes zero
   specificity — `:where(.cv2) button` = **(0,0,0)**. Now *anything* with
   a class beats it (our `cv-*` rules, a shared `.v2-btn`, a Tailwind
   `.px-3`), while bare `<p>` / `<ul>` / `<button>` still reset.
2. **Component rules are double-scoped** `.cv2 .cv-foo` **(0,2,0)** — the
   same discipline suite.css uses (`.core-suite .card`). Belt and braces.

Net: a reset can only ever *lose* to a real style. Never write a
single-class component rule that a `.cv2 element` reset could beat, and
never give a reset more than zero specificity.

## Extending

Add a token? Put it in `tokens.css` under **both** `data-theme` blocks
(or just the dark default if mode-invariant) and document the row above.
Add a component class? Prefix it `cv-`, build it from tokens (never
hard-coded hex), and add it to the reference here in the same commit
(Rule #11). Never reach into admin or suite.css classes — Core v2 owns
its whole surface.
