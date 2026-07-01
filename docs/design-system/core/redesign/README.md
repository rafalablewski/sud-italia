# Sud Italia Core — Service OS Redesign

**Information Architecture & Interaction Model for POS · KDS · Floor · Guest**

> Status: **Design proposal** (awaiting sign-off on sketches before implementation).
> Scope: the `core` operator OS (dark-first, flat, BRACE ember-terracotta brand). Builds on the existing
> `CoreShell` + `themes/core/tokens.css`. This document is the source of truth for the redesign; live
> implementation progress is tracked in [`PROGRESS.md`](./PROGRESS.md).

The redesign is grounded in the *actual* system inventory (see the Feature-Parity Ledger in `PROGRESS.md`).
The problem is not missing features — you have more than most commercial systems (coursing, Floor Twin, SLA
prediction, split/comp/refund guards, multi-channel sync). The problem is that these live in **separate rooms**
(`/core/pos`, `/core/kds`, `/core/service`) that staff mentally switch between during a rush.

---

## 1. Overall UX Philosophy & Guiding Principles

> **One surface, one entity-in-focus, everything about that entity one gesture away.**

1. **The Table is the atom, not the screen.** The check, course state, KDS status, allergy flag, and unpaid
   balance are all *properties of a table* — today scattered across three apps. The new model makes the
   **selected entity** (a table, a takeaway tab, a delivery) the single spine.
2. **Glanceable at 2 m, actionable at arm's length.** Color + motion carry meaning before text. The tone system
   (`basil → amber → danger`) is a *physical urgency gradient*, never decoration. The SLA meter is a heartbeat.
3. **Speed is measurable.** Targets: seat → fire first course ≤4 taps; settle a check ≤3 taps; bump a ticket 1 tap.
   Every flow is scored against a tap budget.
4. **Progressive disclosure by pressure, not by menu.** The system senses load (Floor Twin's calm/warn/risk tier)
   and changes its own information density — collapsing chrome, enlarging targets, promoting the next action.
5. **Delight confirms, never delays.** Micro-interactions answer *"did it work?"* in <120ms (`--fast`).
   Celebration is earned and brief. Nothing on the critical path animates longer than it takes to be believed.

**Material stays honest.** Flat, hairlines, no glass, no glow, ember terracotta as the only warm accent — exactly
right for a kitchen. Premium = instant, certain, legible under grease and glare. Excitement comes from
*responsiveness and flow*, not chrome.

---

## 2. High-Level Information Architecture

### Collapse four apps into one **Service Canvas** with swappable lenses

```
┌── COMMAND BAR ── [Kraków ▾]  ⌘K search  ● 3 at-risk · line 7 · 42m  👤 Ola ──┐
├──────────┬───────────────────────────────────────────────────────────────────┤
│ LENS RAIL│                    THE CANVAS (context-driven)                       │
│ ▣ Floor  │            shows Floor / Line / Pass / Book                          │
│ ▤ Line   │            for the CURRENTLY SELECTED entity                         │
│ ◉ Pass   │                                                                      │
│ ⧗ Book   │                                                                      │
├──────────┴───────────────────────────────────────────────────────────────────┤
│ CONTEXT DOCK — the selected entity's check, always docked (peek → expand)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Command Bar (top, 44px):** location scope, universal `⌘K` search, and a **live pressure indicator**
  (`● 3 at-risk · line 7 tickets · 42-min wall`). The one place global state lives.
- **Lens Rail (left, icon-only 60px, expands on hover):** switches *how you view the room*, not *which app*.
  **Floor** (map), **Line** (POS/ordering), **Pass** (KDS), **Book** (slots/reservations). Crucially the selected
  entity **persists across lenses** — select T12 on Floor → tap Pass → its kitchen tickets are highlighted.
- **Context Dock (bottom, expandable):** the selected entity's check lives here on *every* lens. On Floor it's a
  peek; tap to expand into the full POS ticket without leaving the map. Kills the POS↔Floor round-trip.

### Entity-centric event propagation

One selection, one source of truth (the `Order` + `FloorTable` pair), rendered through whichever lens. Extend the
existing SSE stream to broadcast **selection-independent entity deltas**: a course fired at the POS lights up the
Pass on the kitchen wall *and* the guest's phone in the same tick. One event bus, three renderers, plus the guest
app as a fourth read-only subscriber.

### Role-shaped defaults (same canvas, different landing lens)

| Role | Lands on | Dock default | Rationale |
|------|----------|-------------|-----------|
| Server | **Floor** | their section's tables | "Where are my tables?" |
| Bartender / counter | **Line** | open bar tabs | Order-entry all shift |
| Kitchen | **Pass** (kiosk) | hidden | Bump-only, no dock noise |
| Host | **Book** | tonight's covers | Seating & reservations |
| Manager | **Floor** + pressure overlay | at-risk tables | Firefighting |

---

## 3. Core User Flows

Each flow is scored against a tap budget.

### Flow A — Seat a walk-in & fire the first course (≤5 taps)
1. Tap an open table (Floor) — Twin already flags it available.
2. Radial quick-action blooms: `Seat · Reserve · Combine · Block` → **Seat**; party-size stepper pre-filled from table geometry.
3. Canvas auto-switches to **Line**, menu open, dock = fresh check. Tap products; `flagOnKds`/allergen modifiers surface inline.
4. Tap **Fire** → course selector pre-selects the earliest un-fired course (*Starters*). Confirm.
5. Course sweeps to kitchen; dock collapses to peek `Starters ● firing · Mains ○ held`.

*Why:* radial = no mode switch; party size defaults from geometry; course defaults to "next logical" so 90% of fires are one confirm; held courses stay visible.

### Flow B — Add a mid-meal round & re-fire (≤3 taps)
1. Tap the table — dock is already the live check.
2. Quick-add: type "2 nero" → matches; tap to add (touch users get the grid).
3. **Fire → Drinks course.** Coursing's `{fired, held}` prevents re-sending what's out.

### Flow C — Kitchen bumps a ticket (1 tap)
Tap anywhere on the card → next status (`preparing → ready`). Green sweep + soft thunk; card slides to "ready"; the
linked Floor table pulses "food up." Recall = long-press. Course-complete auto-fires the next held course.

### Flow D — Split & settle (≤4 taps even split; ≤6 by-item)
1. Dock → **Pay** (tender sheet rises).
2. Split presets: `Whole · ÷2 · ÷3 · ÷4 · By item · By seat` → `÷3`, math done.
3. Per card: method (Card/Cash/BLIK/Apple Pay); cash shows quick-tender pad (`20 · 50 · 100 · Exact`) with auto-change.
4. Last card clears → single ember pulse "Settled · 240 zł · 18% tip" → table returns as *needs bussing*.

*Why:* `PosPayment[]` already supports summed tenders — UI just stages them visually. **By seat** uses cover-tagged items. Comp lives *inside* this sheet.

### Flow E — Manager comp / refund with guard (≤4 taps, gated)
1. Long-press a line item → `Comp · Void · Discount`.
2. Reason-code chips (`compReasonCode` enum): *Quality · Wait · Goodwill · Error*.
3. `refund-guard.ts` per-shift cap renders live ("Comps this shift: 34 / 150 zł"). Breach → inline manager-PIN gate.
4. Confirm → struck-through price + comp badge; total re-computes server-side.

### Flow F — Guest orders via QR, staff stays in sync (0 staff taps until ready)
1. Guest scans table QR → `QrOrder` (channel `qr`, table pre-bound), same menu/modifiers/allergen sheets.
2. Order lands on the table's check as a **pending course**; Floor gains a "guest-ordered" badge; server gets a soft toast.
3. Server one-taps **Fire** (or edits). Guest's phone flips to a live status mirror of the Pass SLA meter (same SSE stream).
4. Guest can add rounds; each appends to the same check. Guest pays on phone *or* server settles — one `Order` reconciles.

*Why:* guest and staff act on the *same entity through different renderers*. No parallel order. "Sync" is the absence of a second source of truth.

---

## 4. Key Screen Layouts & Prioritization

### 4.1 Floor lens (home base)
Table tiles sized by capacity, colored by Floor-Twin status. Each tile carries **at most 3 glance-facts**:
occupancy dots + party size, dwell time, and the *single most urgent state* (firing / at-risk / unpaid / clean).
No tile shows a full check — that's the dock's job. **Twin-driven rule:** border + status line show the *highest
urgency* fact, not a fixed field. Long-press → table admin (merge, move, block, edit).

### 4.2 Line lens (POS)
Category rail + product grid + dock. A **★ Popular / Smart** category is always first, populated from real order
frequency for this location + daypart (the ~8 SKUs that are 80% of taps = zero-scroll). **86'd items** auto-grey
and sink. Modifier-heavy items show a dot. The dock is the *same component* as on Floor.

### 4.3 Pass lens (KDS kiosk)
Columns = status ladder; *within* a column, cards sort by **SLA urgency** (`kds-prediction`). Whole card = bump
target. **Allergen + KDS-flagged modifiers render in danger, large.** Held courses dim with `⊘`. Station filter is
a segmented control. **Pressure-adaptive density:** calm = roomy cards with descriptions; risk = auto-compact,
drop non-essential text, at-risk column gets a pulsing rail.

### 4.4 Book lens (slots & reservations)
Timeline-over-tables grid: tables on the y-axis, service hours on x. `findReservationConflicts()` renders as a red
hatch the instant two blocks overlap. Drag to reassign; conflict check runs live. Tonight's covers roll into the
Command Bar pressure number.

---

## 5. Smart Wiring & Feature Surfacing

Every feature appears at the moment its precondition is true, not in a menu.

1. **Contextual radial on every entity** — verbs change with state (open→`Seat/Reserve/Combine`; seated→`Add/Fire/Move/Pay`; unpaid→`Pay`).
2. **Coursing as a live spine** on the dock: `Antipasti ✓ · Primi ● · Secondi ○ · Dolci ○`; tap a held course to fire; kitchen-complete auto-suggests the next.
3. **Upsell/cross-sell at the fire moment** — `getCartSuggestions()` surfaces as a slim chip on Fire confirm ("Add 2 tiramisu? +48 zł").
4. **Comp/discount/void on the line item** (long-press) with the `refund-guard` cap shown in situ.
5. **86 / low-stock flows inventory→POS automatically** — tiles grey in real time; Pass shows a passive banner.
6. **`⌘K` universal jump** — resolves tables, checks, guests, SKUs, and *actions* ("comp", "open till", "reprint").
7. **Guest app as a fourth renderer** — QR writes to the same check; guest status view subscribes to the same SSE stream.
8. **Handoff continuity** — one-tap `/handover` pre-filled from live state (open tables, at-risk tickets, comps vs cap, cash variance).

---

## 6. Micro-interactions, Feedback & Error Handling

All motion uses the Core tokens (`--fast` 130ms, `--base` 200ms) and respects `prefers-reduced-motion`.

- **Fire course:** items sweep up toward the Pass; course chip flips `○ → ●`.
- **Bump:** green sweep + soft thunk; card slides to next column.
- **Payment settled:** a single ember pulse + "Settled · 240 zł · 18% tip." One pulse; large split earns a slightly longer flourish, an espresso does not.
- **Add to check:** 120ms slide-in; total ticks up (JetBrains Mono figures).
- **Optimistic by default, reconciled honestly.** Every action commits instantly; a server reject rolls back with a directional shake + a specific, recoverable toast (e.g. *"Card declined — try another tender?"* with the sheet re-open on the failed card).
- **Errors staged by severity:** passive toast (info) → blocking-but-recoverable (inline danger control, e.g. the PIN gate) → hard stop (centered dialog only for data-integrity, portal-mounted).
- **Ambient pressure feedback** — the Command Bar indicator + Pass auto-compaction *are* feedback; the UI has a pulse matching service.
- **No spinners on the critical path** — Skeletons on first paint; after that SSE streams state into place.

---

## 7. Recommended Design Patterns & Components

**Reuse & elevate (existing):** `CoreToastProvider`/`useCoreToast()`; `.core-ticket` → Context Dock;
`kds-board.ts` tone/urgency utilities (drive Pass cards *and* Floor tiles); `floor-twin.ts` (tile prioritization,
pressure indicator, Book pacing); command palette `⌘K` → universal jump; SSE stream → entity-delta events.

**New primitives:**

| Component | Purpose |
|---|---|
| `<ServiceCanvas>` | Shell hosting 4 lenses + persistent dock; holds `selectedEntity` |
| `<LensRail>` | Icon-rail lens switcher (Floor/Line/Pass/Book) |
| `<ContextDock>` | Always-present selected-check drawer (peek → expand) |
| `<RadialActions>` | State-aware verb bloom on entity tap |
| `<CourseSpine>` | Live coursing tracker + fire control |
| `<SlaMeter>` | Shared timing "heartbeat" (Pass card + Floor tile + guest phone) |
| `<TableTile>` | Glance-fact table cell (max 3 facts, urgency-driven) |
| `<TenderSheet>` | Split/pay/comp bottom sheet (presets, quick-tender, in-sheet guard) |
| `<PressureBadge>` | Command-bar load indicator |

**Pattern rules:** bottom sheets over center modals for thumb-triggered actions; whole-object tap targets on Pass
& Floor (44px floor); segmented controls over dropdowns on the critical path; color is semantic never decorative;
density is a function of pressure (implemented once in `<ServiceCanvas>`); every mutation optimistic + reconciled.

---

### The feel, in one paragraph

A server walks the floor and the room *reads itself back to them*: T10 beating amber because mains are six minutes
hot, T2 glowing calm-green and free, the bar tab in the dock following them table to table. They tap T10, the check
is already there, fire the held dessert with one touch, and watch it sweep toward a kitchen wall that — across the
building — pulses that same card to life. A guest at T7 adds two Aperols from their phone; a soft chime, a badge,
one tap to fire. When the check settles, a single ember pulse says *done, 18% tip, nicely paced*. Nothing was
hunted for. Nothing took four screens. The system felt like a **second set of hands that already knew what came next.**
