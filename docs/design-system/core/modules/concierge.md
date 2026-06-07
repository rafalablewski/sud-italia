# Concierge — AI capability layer

← back to [README](../README.md)

The proprietary advantage made operator-visible. The Concierge is the
**single capability layer** that powers both the public read API (MCP /
HTTP) and the WhatsApp ordering bot — exposed once, served on both
channels.

**Live code:** `src/core/guest/AdminConcierge.tsx`,
`src/lib/concierge/capabilities.ts`, the public endpoint
`src/app/api/agent/[capability]/route.ts`.
**Mockup:** `guest-concierge.html`.

## The six capabilities

Fixed order, defined in `src/lib/concierge/capabilities.ts`:

| ID | Kind | Transport | Description |
|---|---|---|---|
| `get_menu` | resource | public | Full menu with prices, categories, dietary tags |
| `check_availability` | tool | public | Live availability + prep time per item / location |
| `get_allergens` | tool | public | EU-14 allergen + dietary breakdown |
| `place_order` | tool | conversational | Create takeout / delivery order, returns id + ETA |
| `create_payment` | tool | conversational | Issue a Stripe payment link / take payment |
| `locate_truck` | tool | public | Where the truck is now + today's schedule |

`public` capabilities serve over the HTTP read endpoint. `conversational`
capabilities run only through the WhatsApp bot (web checkout for payment).

## Layout

Two-pane:

```
+--------------------------+---------------------------------------+
| Capability list          | Inspector                             |
| + Transports panel       | (selected capability)                 |
|                          |                                       |
| stat line                | title · kind · transport label        |
| 6 cap rows w/ toggles    | live endpoint + status                 |
| MCP / WhatsApp panel     | [ Test live ]   HTTP 200 · 30ms       |
|                          |                                       |
|                          | "What the agent sees" JSON inspector  |
|                          |                                       |
|                          | EU-14 allergen matrix (for get_allergens) |
+--------------------------+---------------------------------------+
```

## Capability row — `.cap`

A 3-column layout: icon · name + description · toggle.

```
[icon]   get_allergens   [Tool]                                  [●━━]
         EU-14 allergen + dietary breakdown · public read
```

- Icon is a 34×34 raised tile, custom stroke icon, **platinum** colour.
- `.kind` chip uses `info-soft / platinum-soft` to differentiate Tool vs
  Resource.
- Toggle is the standard `.sw-toggle` — toggle = saved (CLAUDE.md rule #7,
  via `PATCH /api/admin/concierge`).

The active inspector capability has an `inset 3px 0 0 var(--platinum)`
left bar — the platinum signature applied (sparingly) to mark focus.

## The toggle contract

A toggle is the operator deciding whether an agent can answer a question.
When off:

- The capability card dims (`opacity: .5`).
- The public read endpoint returns **403** with an actionable note
  ("Capability disabled by operator").
- The WhatsApp bot won't pick it.

This is the one place where a customer-facing surface is **gated by an
operator click** — it must persist immediately and reflect in the read
endpoint in the same request.

## Live test runner

For `public`-transport capabilities, the inspector exposes a **Test live**
button. It calls `GET /api/agent/<capability>?location=krakow` and shows
the response:

- HTTP status + duration (`HTTP 200 · 30ms`) as a `success` badge
- The JSON body in `.json` syntax-highlighted block:
  - keys in `--info` (steel)
  - strings in `--success`
  - numbers in `--platinum`
  - bools in `--brand-bright`

`conversational` capabilities show a status note instead — they don't
serve over HTTP; the live test happens via WhatsApp.

## The EU-14 allergen matrix

Shown only when `get_allergens` is selected. A compact table:

| col | content |
|---|---|
| 1 (left) | item name |
| 2–14 | allergen pictograms (🌾 gluten, 🥛 milk, 🥚 egg, 🥜 nuts, 🐟 fish, …) — filled red dot if declared |
| last | dietary tags (veg / gf / etc.) |

This is the **one place where emoji are retained** — see
the Core theme's iconography rule ([`../theme/`](../theme/) — custom stroke, no emoji in UI chrome).
The allergen pictograms are a recognised EU-14 domain convention; replacing
them with custom icons would lose clarity.

A note under the matrix:

> *Filled = declared allergen. The agent reads this matrix — every allergen
> answer is auditable, never guessed.*

The "auditable, never guessed" is the brand promise of the whole module
and should appear on the surface.

## Transports panel

Two rows beneath the capability list:

| Transport | Status |
|---|---|
| **MCP / HTTP read API** · `/api/agent/<capability>` | Live |
| **WhatsApp Business** · `/api/webhook · ordering bot` | Live / Needs config (depending on env vars) |

Each row carries a small icon (stroke), the friendly endpoint label, and a
live/needs-config status badge.

## MCP / WhatsApp view toggle

A segmented control at the top-right:

```
[ MCP server ]  [ WhatsApp ]
```

- **MCP view** (default) — capability inspector + JSON + allergen matrix
  (the operational view).
- **WhatsApp view** — the same capability layer rendered as it appears to
  the bot: connection status, capability chips (dimmed when off), a link
  to `/core/guest/whatsapp` console, config hint if WHATSAPP_PHONE_NUMBER_ID +
  WHATSAPP_ACCESS_TOKEN aren't set.

## Location scope

A per-truck segmented control in the header drives the sample payloads
+ the allergen matrix. The truck list is derived from
`getActiveLocations()` so the segmented automatically picks up a new
truck the moment it's added in `/admin/locations` — no edit to this
component needed. All sample JSON is computed from **live
menu/availability data**, not canned — so what the operator sees is
what the agent answers with.

## Status line + thesis

At the top of the capability column:

> **6 capabilities** · **4 live** · 1,284 calls on the public read endpoint
>
> *One capability layer, exposed once over MCP/HTTP and the WhatsApp bot —
> the agent never guesses; every answer is auditable.*

This thesis is the module's reason for being. It appears on the live
surface so operators understand what they're toggling.

## What this module is not

- Not a chat console (that's WhatsApp).
- Not a CRM (that's the Guests view).
- Not a menu editor (that's `/admin/menu`).
- Not a "VIP / special-request" handler — none of those exist here. VIP
  segmentation lives in CRM filters; special requests live in WhatsApp
  transcripts and Concierge notes on the CRM profile.

The Concierge is the **switchboard** between the menu/availability data
and every channel an agent can speak on.
