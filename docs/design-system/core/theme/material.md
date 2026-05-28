# Core — Material

← back to [Core README](../README.md)

Depth, hairlines, radius, motion — the rules for how Core surfaces sit
on top of each other. The Atlas dark canvas is the substrate; every
other surface is one step closer to the operator.

## The elevation ramp

Three steps, every Core surface picks one. Don't invent a fourth.

| Step | Surface         | Used by                                                           |
| ---- | --------------- | ----------------------------------------------------------------- |
| 0    | `--cmd-canvas`  | The page background. `.kds-atlas`, `.pos-tabs`, `.crm-atlas`, `.cncrg-atlas`, `.wa-atlas` wrappers. |
| 1    | `--cmd-panel`   | The chrome panels: command header (`.cmd-head`), sidebar / tabrail, sticky subbar (`.cmd-subbar`). |
| 2    | `--cmd-raised`  | The content cards: KDS ticket (`.ka-ticket`), POS tab card (`.pos-tab`), CRM regular row when expanded, Concierge tool card, WhatsApp thread card. |

A nested raise inside a raised card uses `--cmd-hair-strong` border +
`background: transparent` — never a 4th surface tone. The depth has
already been "spent" by the parent.

## The hairline + border rules

- **Default separator:** `--cmd-hair` (`rgba(255,255,255,0.08)`).
  Between table rows, between sidebar items, between a card's header
  and body.
- **Emphasised separator:** `--cmd-hair-strong` (`rgba(255,255,255,0.16)`).
  Modal edges, card border when raised, table header underline.
- **Status border** for raised cards in a status state — the colour is
  the status hue (`--cmd-late`, `--cmd-warn`, `--cmd-firing`,
  `--cmd-ready`), 1px, never thicker. The 4px coloured rail on the
  left of `.ka-ticket` (the `::before` pseudo-element) is the *one*
  exception — that's the across-the-room signal.
- **No outer drop shadows.** Core surfaces communicate depth through
  tone change + hairline, never through a `box-shadow` ring. (A
  modal's portalled overlay is the lone exception — it gets a
  `0 8px 32px rgba(0,0,0,0.6)` scrim to detach from the canvas.)

## Radius

| Element                       | Radius |
| ----------------------------- | ------ |
| The wrapping Atlas surface    | 14px (one corner break — the rest of Core gets less) |
| Ticket cards, POS tab cards   | 12px   |
| Buttons, chips, pills         | 7–8px  |
| Small inline badges (.cmd-chip on count) | 5px |
| Inline meta separators        | 1px (no radius — they're hairlines) |

The 12px card radius is deliberate: bigger than Admin's 10px to make
the cards read as physical objects on the dark canvas, but smaller
than Homepage's 16px because Core is functional, not generous.

## Motion

**Quiet, fast, never decorative.**

| Pattern                      | Spec                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| Hover state change           | `transition: background .16s, border-color .16s` — that's it.    |
| Ticket entering / leaving the board | 200ms fade + translateY(4px). No spring, no scale.          |
| Status colour change on a ticket (firing → warn → late) | Instant — no transition. The operator must see the threshold crossed, not interpolate it. |
| Modal / sheet entrance       | 240ms cubic-bezier(0.32, 0.72, 0, 1). Same easing as the rest of the system. |
| Toast slide-in               | 200ms. Auto-dismisses at 4s unless it's an error.                |
| The 4px coloured rail's colour change | Instant — same reason as the ticket border.              |

**No spring physics on operator stations.** Spring motion is delightful
on a guest's phone (Homepage uses it for the cart add); it's noise on
KDS where 12 tickets all spring-bouncing at once is visual chaos.

## Focus

Keyboard focus on a Core surface uses a 2px outline in `--cmd-text` at
2px outset — high-contrast, no colour tint. The operator running POS
on keyboard shortcuts must see exactly where the next tab will land.

## The dense-list specifics

Core lists are tight. The rules:

- **Row height:** 44px on KDS ticket-cards rows; 36px on CRM customer
  rows; 32px on POS tab line items. Each is tuned to the density of
  the surface.
- **Row hover:** background lifts by `rgba(255,255,255,0.04)` —
  visible but quiet.
- **Row separator:** the `--cmd-hair` line — always horizontal, never
  vertical (we don't draw column separators inside cards).
- **No zebra striping.** Core has no alternating-row pattern; the
  hairline does the work.

## What this material is not

- It is **not** the Admin material spec. Admin allows soft shadows
  for raised glass cards, has a larger radius default (10px on the
  v2-card), and uses spring motion on the command palette. Core is
  tighter on all three.
- It is **not** customisable per module. A KDS ticket card and a POS
  tab card use the same elevation, the same radius, the same hover.
  This is the visual consistency that makes Core read as one product.
- It is **not** a freeze. Core motion + material can evolve, but the
  evolution has to apply across all five Core modules at once — never
  one module diverging.

Core material is the **physical-object metaphor for an operator
surface**: enough depth to feel real, never so much that it slows the
read.
