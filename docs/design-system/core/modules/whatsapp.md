# WhatsApp — messaging centre

← back to [README](../README.md)

The operator console for the live ordering channel. WhatsApp is **not** a
secondary surface — it's where many orders actually happen, and it sits
inside the unified **Guest Engagement** hub (Inbox / Guests / Concierge).

**Live code:** `src/components/admin/AdminWhatsApp.tsx` and the dialogs
in `src/components/admin/whatsapp/`.
**Mockups:** `guest.html` (Inbox), plus the dialogs:
- `guest-settings.html` — full channel settings
- `guest-broadcast.html` — campaign composer
- `guest-funnel.html` — conversion-funnel analytics

## Layout — three-pane Inbox

```
+------------------+-------------------------------+-----------------+
| Conversations    | Transcript                    | Live order +    |
|                  |                               | Guest summary   |
| KPI strip        | head: name · 24h window pill  |                 |
| 4 tabs + counts  |                               | Cart · subtotal |
| Search           | day separator                 | Fulfillment     |
|                  | message bubbles               | Slot            |
| conv list rows   |   in / out / bot / system     | Pay link        |
|                  |   message kind + actor labels |                 |
|                  |                               | Funnel checklist|
|                  | Concierge "assist" card       |                 |
|                  |                               | Guest header    |
|                  | composer                      | LTV · tier      |
|                  |   quick-actions + textarea    | Open profile →  |
+------------------+-------------------------------+-----------------+
```

The right pane is the **live guest profile** — so the operator never
leaves the thread to know who they're talking to. Link to the full CRM
profile sits at the bottom.

## KPI strip (top)

5 compact `.wa-kpi` card tiles (`.wa-kpis` grid) above the panes:

| KPI | Source |
|---|---|
| Orders · 7d | `/api/admin/whatsapp/metrics` (channel=whatsapp, paid) |
| Conversion · 7d | wa orders 7d / unique inbound phones 7d |
| Active sessions | WaSessions still inside the 90-min TTL |
| Awaiting pay | sessions with `pendingPaymentUrl` |
| Lifetime paid | all-time wa channel paid order count |

## Inbox tabs

Four tabs with live counts:

| Tab | Filter |
|---|---|
| **Inbox** | All non-archived |
| **Live** | Conversations with an active session |
| **Awaiting pay** | Sessions with `pendingPaymentUrl` |
| **Archived** | `archivedSet` (auto-archive after N idle minutes) |

The active tab uses `--brand-soft` background + `--brand-bright` text (the
same pill treatment as the segmented `.on` state).

## Conversation row — `.conv`

A 3-column grid (40px avatar · 1fr meta · auto right):

- **Avatar** (`.wa-conv-av`) — initials in the channel accent
  (`--wa-accent`; Core has no platinum token), with a **live dot**
  (`.wa-conv-av-ch`, `--wa-accent`) on the corner if the conversation has
  an active session, otherwise `--wa-faint`.
- **Name** (tier pill lives on the right-pane guest card, not the row).
- **Last-message snippet** truncated.
- **Tags** row — `Kraków` location, item count (`9 items`), `sim` (purple)
  if simulated, `awaiting pay` (warning).
- **Right column** — relative time + unread count pill (`--brand` solid).

Pinned conversations carry a stroke pin icon (not 📌).

## Transcript

### Head row

- Guest name (Fraunces 17px) + phone + channel
- **24h window pill** — `Open` (success-soft) or `Closed` (neutral). The
  composer hint reflects this: inside the window, free-text; outside,
  only the configured `reopenTemplate`.
- Reset-session button (stroke refresh icon — not ⟲)

### Message bubbles

Bubbles by direction × actor:

| Class | Bg | Border |
|---|---|---|
| `.bub.in` (customer inbound) | `--surface-2` | `--border` hairline |
| `.bub.bot` (bot outbound) | `--surface-1` | `--info-soft` hairline (steel) |
| `.bub.out` (operator outbound) | `--brand` | none, white text |

Each bubble carries:

- Actor label (`Customer` / `Bot` / `You · Marco`) — small uppercase
- **Kind chip** (`interactive list` / `template: welcome_back` /
  `CTA → url` / `tap` / `location` / `unsupported`)
- Timestamp

System events render as centered text between hairlines (e.g.
*"Tapped 20:00 · slot held"*).

### Concierge "assist" card

When the AI surfaces a suggestion, it renders as a refined inline panel:

```
[CONCIERGE · SUGGESTED]
Lucia is Gold (28 visits). Anniversary here last year, sat at corner
banquette (T7) — free at 20:00. Allergens on file: none.

[ Hold T7 · 20:00 ]   [ Insert reply ]
```

Treatment: `--platinum-soft` background flat (no gradient), 1px platinum
soft border, platinum uppercase eyebrow. **One** platinum element per
message thread.

### Composer

- Quick-reply chips (`.wa-quick-chip`) above the textarea — **Menu**,
  **Payment link**, **Reservation**, **Comp dessert**, **Re-open
  template**. Text-only pills (no icons). Most insert a short starter into
  the composer for the operator to review and send; **Payment link**
  inserts the chat's live Stripe URL (or toasts when none is pending), and
  **Re-open template** fires the configured `welcome_back` template.
- The textarea — `--surface-2`, 14px Inter, steel focus ring.
- Hint line below: *"Inside 24h service window — free-text allowed. Outside
  it, only the **welcome_back** template can re-open."*

## Live order context (right pane)

Top section:

| Key | Value |
|---|---|
| Location | `Kraków` |
| Cart | `9 items · 281 zł` (mono, tabular) |
| Fulfillment | `Dine-in` |
| Slot | `20:00` |
| Pending order | `#4821` (mono) |

When `pendingPaymentUrl` is present, a **warning-soft** strip surfaces:

> 🔗 Open Stripe pay link →

Beneath the live order: a **conversion funnel checklist** — each step a
`.check` row (Location set · Cart has items · Fulfillment chosen · Slot
picked · Awaiting payment). The done rows get a `--success` filled circle
+ check, the pending row stays neutral with an empty circle.

Below the funnel: the **guest summary** (avatar, name in Fraunces, tier
pill, LTV + Avg-spend stats) + an *"Open full profile →"* link to the CRM
view.

## Per-conversation actions

In the transcript head:

- **Share payment link** — ghost button
- **Book table** — ghost button
- **Reset session** — icon (refresh)

Higher-level (operator-only) actions live in the topbar:

- **Broadcast** — opens `guest-broadcast.html`
- **Funnel** — opens `guest-funnel.html`
- **Settings** — opens `guest-settings.html`

> **Shell note:** the three dialogs (`WhatsApp{Settings,Broadcast,Funnel}
> Dialog.tsx`) render through the shared admin `Dialog` (v2), which
> portals to `#admin-portal-root` (falling back to `document.body`) via
> `adminOverlayTarget()` — see the Dialogs/overlays note in
> [`admin/theme/components.md`](../../admin/theme/components.md#dialogs--overlays)
> for why (font scope + the `.admin-bg` stacking trap). They pass
> **`theme="core"`**, which tags
> the portal root `.v2-dialog-core`; a scoped block in `suite.css`
> redefines the admin token vars (`--surface-*` / `--fg` / `--border` /
> `--text-muted`) to the warm-neutral dark palette, so the dialog chrome
> **and** the bodies (`.wa-fa-*` / `.wa-bc-*` / `.wa-cfg-*`) recolor to
> the dark mockup look without rewriting any body markup. POS's
> table/address dialogs use the same `theme="core"` skin.

## Broadcast composer (`guest-broadcast.html`)

Centered dialog with:

- **Audience select** — segmented options with live counts
  (`VIP · ≥200 zł & ≥6 orders — 84`, etc.)
- **Meta template name** input (required to message outside the 24h window)
- **Send to N guests** — `xl` primary button
- **Recent campaigns** list — each with progress bar, sent/failed counters,
  and a `Resume` button for paused runs.

Segment logic in `src/lib/whatsapp/audience.ts`. Sends batched 25/tick;
a daily cron drains any campaign left mid-send.

## Conversion funnel dialog (`guest-funnel.html`)

Window selector (7d / 30d / All time) + a 7-stage `.funnel` ladder:

```
Started chat   ───────────────  612 · 100%
Location set   ──────────────   548 · 90%       (−64 · 10%)
Cart has items ──────────       421 · 69%       (−127 · 23%)
Fulfillment    ─────────        388 · 63%       (−33 · 8%)
Slot picked    ────────         352 · 58%       (−36 · 9%)
Payment link   ──────           261 · 43%       (−91 · 26%)
Paid           ───── (success)  208 · 34%       (−53 · 20% — abandoned at pay)
```

A `--surface-2` callout at the bottom calls out the biggest leak in
plain language so the operator knows what to tune.

## Settings hub (`guest-settings.html`)

A scrollable dialog with grouped sections:

- **Channel** — enable toggle, default-location fallback, daily inbound cap.
- **Messages** — welcome message, opt-out keywords, re-open template name.
- **Conversation lifecycle** — auto-archive minutes.
- **Business hours** — per-day open/close + `Closed` checkboxes. Enforce
  toggle drives the away message.
- **AI concierge** — enable, extra instructions (4000 chars max, appended
  to the base prompt), away message.
- **Auto-replies** — keyword → reply pairs.
- **Abandoned-cart recovery** — enable + wait-hours.
- **Scripted flows** — name + trigger keyword + ordered steps.

Toggles within Settings save immediately (CLAUDE.md rule #7). The dialog
footer has a single `Save settings` button for the text fields.

## What this module is not

- Not a campaign analytics dashboard (only the funnel dialog).
- Not the CRM profile (the right pane is a summary + link).
- Not a chat web client — operators *can* reply, but the bot handles most
  turns. Inside the 24h window, an operator can use free-text; outside it,
  only Meta-approved templates.

The point of this module is **let the bot run, watch it work, intervene
when needed.**
