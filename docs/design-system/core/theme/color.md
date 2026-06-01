# Core — Colour

← back to [Core README](../README.md)

Core runs on the `--cmd-*` palette (declared in
`src/app/themes/core/index.css` at the `:root` block — line 8177 of the
pre-split history). It's warm-neutral, dark-canonical, and **every
status hue means a status** — not a brand colour, not a decoration.

## The canonical palette (dark, declared in `themes/core/index.css`)

| Token                  | Value                                    | Use                                          |
| ---------------------- | ---------------------------------------- | -------------------------------------------- |
| `--cmd-canvas`         | `#0a0a0c`                                | Page background — the surface everything sits on. |
| `--cmd-panel`          | `#141318`                                | Sidebar, header chrome, the rail under tabs. |
| `--cmd-raised`         | `#222028`                                | Ticket cards, POS tabs, raised surfaces.     |
| `--cmd-hair`           | `rgba(255,255,255,0.08)`                 | Default 1px separator.                       |
| `--cmd-hair-strong`    | `rgba(255,255,255,0.16)`                 | Emphasised separator (table headers, modal edges). |
| `--cmd-text`           | `#f1efe9`                                | Primary text. Warm white — never pure `#fff`. |
| `--cmd-dim`            | `#b6afa6`                                | Secondary text (meta, captions).             |
| `--cmd-faint`          | `#918880`                                | Tertiary text (disabled, distant counts).    |

## The status hues — meaning, not decoration

| Token                  | Value        | Status it represents                          |
| ---------------------- | ------------ | --------------------------------------------- |
| `--cmd-queued`         | `#6a655f`    | Ticket waiting / unstarted. Neutral by design. |
| `--cmd-firing`         | `#4d90e8`    | Actively being prepared. Calm blue.           |
| `--cmd-warn`           | `#e0a93f`    | Pacing concern (within SLA but trending late). |
| `--cmd-late`           | `#e5484d`    | Past SLA. The only red on the Core surface.   |
| `--cmd-ready`          | `#3dd68c`    | Ready to bump / pick up.                      |
| `--cmd-risk`           | `#9a72e0`    | The "AI" violet — used for Concierge surfaces and AI-derived signals. |

Plus the matching `*-soft` variants for fill backgrounds:
`--cmd-risk-soft`, `--cmd-warn-soft`, `--cmd-late-soft`,
`--cmd-ready-soft`, `--cmd-firing-soft`.

## The jewellery accent

| Token                  | Value        | Use                                          |
| ---------------------- | ------------ | --------------------------------------------- |
| `--cmd-platinum`       | `#cbb48a`    | The command-header rail, the active tab underline, key numerals on the POS tender pad. *Hairlines + accents only — never as a fill.* |

Platinum on Core is the same rule as on Admin: it's jewellery, not
paint. A platinum-coloured *button* would read as a one-off and break
the system.

## The rules

1. **Status hues are reserved for status.** Don't use `--cmd-warn` for
   a "warning-toned" badge that isn't actually a warning. Don't use
   `--cmd-late` for "late-themed" branding. The line cook learns to
   read these colours in muscle memory.
2. **`--cmd-firing` is the same blue as `--cmd-firing` everywhere.**
   It means "actively being made" on KDS, "actively being charged" on
   POS, "actively in conversation" on WhatsApp. The semantic is shared
   across modules.
3. **Never two reds.** `--cmd-late` is the only red. There's no
   "secondary red" for danger / destructive. A POS delete confirmation
   uses the same `--cmd-late` accent the KDS uses for a late ticket.
4. **Backgrounds get the soft variant, borders get the strong one.**
   A late ticket has `background: var(--cmd-late-soft)` and
   `border-color: var(--cmd-late)` — never the other way around.
5. **No gradients.** Flat solids, hairlines, neutral shadows for
   elevation. No `linear-gradient` fills on surfaces or buttons, no
   colour-tinted glow shadows. Same rule as the rest of the system,
   enforced hardest on Core.

## Cross-module shared `.cmd-*` classes

The `--cmd-*` palette is consumed by the `.cmd-*` utility classes that
are shared between KDS, POS, CRM, Concierge, and WhatsApp:

- `.cmd-head` — the command header bar (shared chrome).
- `.cmd-eyebrow*` — the eyebrow row above the main grid.
- `.cmd-subbar` — the filter / quick-action row beneath the header.
- `.cmd-btn`, `.cmd-chip`, `.cmd-seg*` — buttons, chips, segmented
  controls scoped to Core.

These `--cmd-*` classes only live on the KDS Core surface (`.kds-atlas`
+ the `.wa-console` dialogs). POS + Guest moved to the `.core-suite`
token set in `suite.css`. Neither leaks into Admin.

## What this colour system is not

- It is **not** an inherited palette from Admin. Core has its own
  scope. A change to Admin's `[data-admin-theme="dark"]` tokens does
  not affect any Core surface.
- It is **not** a customisable palette. The values above are fixed —
  changing `--cmd-canvas` to a different shade of black requires a
  design review because every Core module is tuned to this surface.
- It is **not** the system's only dark theme. Admin has its own dark
  scope. The two share *no* token values; they happen to land in
  similar territory because dark, warm-neutral, high-contrast is the
  honest answer for both.

The Core palette is **the visual contract** between every Core
module — the reason a Sud Italia POS reads as part of the same product
as a Sud Italia KDS.
