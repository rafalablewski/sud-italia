# public/mockups/agent

Agent-commerce direction — **Concierge** — served on every deploy at
`/mockups/agent/`. The companion to the POS terminal (`../pos/`), the KDS
gallery (`../kds/`) and the CRM (`../crm/`). It reuses the **shared Atlas
visual language** (Inter + JetBrains Mono, the dark canvas, the header/footer
chrome) and leans on the system's **violet "AI" accent** (the same tone the POS
AI offers and the CRM next-best-action use).

Pure, self-contained HTML + inline CSS + inline JS — no build step, no
framework. The only external resource is the Google Fonts link (permitted by
the relaxed `/mockups/*` CSP in `next.config.ts`).

## The thesis

As discovery and ordering move into **AI assistants** (ChatGPT, Claude,
Perplexity) and **WhatsApp**, the restaurants that expose structured, real-time
data — menu, availability, allergens, ordering, payments — win the order.
Whoever builds the "Stripe for restaurant agent commerce" gets a tollbooth on
that shift. The contrarian move for an indie truck is to be **agent-ready**
before the category is priced.

The design insight: **MCP and WhatsApp are two consumers of one capability
layer.** Build the capabilities once; expose them to machines (MCP) and to
humans (WhatsApp) without duplicating logic.

## The chosen direction

| # | File | Direction |
|---|---|---|
| Agent | `concierge.html` | **Concierge** — dark · one capability layer exposed over MCP **and** WhatsApp |

**Left rail (always on) — the capability surface.** Six MCP capabilities —
`get_menu` (resource), `check_availability`, `get_allergens`, `place_order`,
`create_payment`, `locate_truck` (tools) — each with a live/off **exposure
toggle** (toggle = saved), a call count, and a kind badge. Below: the
**connected agents** (ChatGPT, Claude, Perplexity live; Gemini pending) with
their last call.

**Right pane — switch the `Channel` (header, or press `C`):**

- **MCP server** — the agent inspector. The selected capability's endpoint
  (`mcp://suditalia/krakow/get_allergens`), a syntax-highlighted **"what the
  agent sees"** JSON sample, and the live **request log**. For `get_allergens`
  it also renders the **EU-14 allergen matrix** (every item × gluten / dairy /
  eggs / nuts + dietary tags) — the agent reads this, so every allergen answer
  is auditable rather than guessed. This is the EU-defensible core.
- **WhatsApp** — a live, branching **pre-order chat**. The guest asks for vegan
  options, checks whether the pesto is nut-free, orders, and pays via a Stripe
  link — and each agent turn shows the **tool calls** (the violet chips) it
  makes against the very same capabilities. No app, no sign-up; on payment it
  saves the number to the guest graph (ties into the CRM).

It runs end to end over the real Kraków menu in złoty (allergen keys + dietary
tags mirror `src/data/types.ts`): toggle capabilities, inspect any tool's JSON
+ allergen matrix, switch to WhatsApp and click through ordering → allergen
check → payment.

## Browsing

- Locally: `npm run dev` → `http://localhost:3000/mockups/agent/`
- On any deploy: `/mockups/agent/`

`index.html` is the landing; `concierge.html` is the interactive surface.

> **Next step:** stand up a real **MCP server** in `src/` that exposes the live
> menu (`src/data/menus/*` + `getMenuWithOverrides()`), availability, allergens
> (the `Allergen` union), `place_order` (orders + KDS) and `create_payment`
> (Stripe) over the protocol — sharing the capability layer the existing
> WhatsApp agent (`/admin/whatsapp`, `/api/webhook`) already consumes.
