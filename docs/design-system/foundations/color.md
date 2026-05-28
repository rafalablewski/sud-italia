# Colour

← back to [README](../README.md)

One signature accent (**deep burgundy / oxblood**), one metallic (**champagne
platinum**), a calm steel-blue for focus/info, and a disciplined semantic
set. Burgundy matures the old Italia red into fine-dining territory and
finally separates *brand* from *danger*.

## Dark theme (canonical) — `[data-admin-theme="dark"]`

| Role | Token | Value |
|---|---|---|
| Page background | `--bg` | `#0c0b0e` (warm-neutral charcoal) |
| Sidebar / modal | `--surface-1` | `#17161c` |
| Input / inset | `--surface-2` | `#1d1b23` |
| Active / raised | `--surface-3` | `#262430` |
| Hover | `--surface-hover` | `#2f2c39` |
| Hairline | `--border` | `rgba(255,255,255,.10)` |
| Strong hairline | `--border-strong` | `rgba(255,255,255,.16)` |
| Text | `--fg` | `#f5f3ee` (warm off-white) |
| Text muted | `--fg-muted` | `#c0b9b0` |
| Text subtle | `--fg-subtle` | `#978e85` |
| **Brand** | `--brand` | **`#a62d49`** burgundy |
| **Platinum** | `--platinum` | **`#cbb48a`** |
| Focus / info | `--border-focus` · `--info` | `#8fa9c9` · `#6e92c0` |
| Success | `--success` | `#2fa875` |
| Warning | `--warning` | `#d9a441` |
| Danger | `--danger` | `#e2504b` |

Each accent has a `*-soft` partner for fills (e.g. `--brand-soft`,
`--warning-soft`). RGB-triplet siblings (`--admin-accent: 166,45,73`, etc.)
exist only so `rgba(var(--x), a)` overlays line up.

## Light theme — `[data-admin-theme="light"]`

Same DNA on warm paper:

| Token | Value |
|---|---|
| `--bg` | `#faf7f2` |
| `--surface-1` | `#ffffff` |
| `--fg` | `#1c1815` |
| `--brand` | `#97283f` |
| `--platinum` | `#9c7e4e` |
| `--info` | `#3f6493` |

Light is **opt-in only** — the boot script in `theme.ts` does *not* honour
`prefers-color-scheme`, so operators never hit a half-lit surface by
accident. The toggle lives in the topbar.

## Command palette — `:root --cmd-*` and `.kds-floor-dark`

Always-dark surface shared by KDS Fleet/Floor/Chef + POS till + CRM /
Concierge / WhatsApp command boards. Warm-neutral, matched to the canonical
dark theme so every "command" surface reads as one product.

| Token | Value |
|---|---|
| `--cmd-canvas` | `#0a0a0c` |
| `--cmd-panel` | `#141318` |
| `--cmd-raised` | `#222028` |
| `--cmd-text` | `#f1efe9` |
| `--cmd-dim` | `#b6afa6` |
| `--cmd-faint` | `#918880` |
| `--cmd-warn` | `#e0a93f` |
| `--cmd-late` | `#e5484d` |
| `--cmd-ready` | `#3dd68c` |
| `--cmd-firing` | `#4d90e8` *(data-viz only)* |
| `--cmd-risk` | `#9a72e0` *(data-viz only)* |

Status hues exist for **data visualisation** (per-station pace gauges, health
rings, throughput sparklines) — they are **not used as ticket-status colour.**
See [`modules/kds.md`](../modules/kds.md).

## The rules

1. **Never hardcode a brand/semantic hex in a component.** Read the token.
   The single exception is status *text* on a soft badge fill, where a
   brighter hex is used deliberately to hold ≥ 4.5:1 contrast on dark.
2. **No gradients.** Flat solids only. No `linear-gradient` fills on
   surfaces or buttons. No decorative `radial-gradient`. No colour-tinted
   glow shadows (no burgundy / brand-tinted `box-shadow`). Neutral elevation
   shadows are fine. A subtle 1px inset highlight on a card is fine (it's a
   hairline, not a gradient).
3. **Platinum is jewellery, not paint.** Hairlines, the wordmark mark,
   owner-tier flourishes, key numerals, the "All together" course tag.
   Never as a fill or action colour.
4. **Burgundy is brand, never status.** A red ticket means *late*, not
   *brand*. If a thing escalates by colour, it uses the semantic set
   (amber → red), never the brand.
5. **Soft fills come from `--*-soft` tokens.** Don't roll your own opacity
   on an accent.

## Data visualisation

Categorical palette is burgundy-led and harmonised (see `theme.ts` `chart`):

```
#a62d49  #cbb48a  #6e92c0  #2fa875  #c77f4a  #8e6fb0  #d98aa0  #7fa86b
```

Sequential ramps interpolate within a **single hue** (burgundy or steel) —
never rainbow. Gridlines use the hairline alpha; axes use `--fg-subtle`.

## Status semantics

| Meaning | Colour |
|---|---|
| Brand / primary action | `--brand` (burgundy) |
| Premium / focal / signature | `--platinum` |
| Information / focus | `--info` (steel blue) |
| Success / on-time / ready | `--success` (emerald, muted) |
| Warning / approaching SLA | `--warning` (amber) |
| Danger / late / destructive | `--danger` (red) |

When a UI needs more states than this (e.g. KDS predictive tiers), it
**escalates within the warning→danger band**, not by inventing new hues.
