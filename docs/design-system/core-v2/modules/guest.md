# Core v2 · Guest

The guest engagement hub. `/core-v2/guest`.

- **Live code:** `src/app/core-v2/guest/page.tsx` (scaffold via
  `ScaffoldSurface`).
- **Status:** **Scaffold (Step 5 pending).** Shell + subbar live (Inbox ·
  Guests · Loyalty · Concierge · Book tabs); body is the scaffold panel.

## Planned anatomy

One roster across every channel, five nested views:

- **Inbox** — the WhatsApp till: a 3-pane (conversation list · thread ·
  live order context + next-best-action), bot/staff bubbles, 24h-window
  state.
- **Guests** — the customer book (CRM): roster + filters + profile drawer
  (LTV, points, timeline).
- **Loyalty** — phone-enrolled members, tiers (Bronze → Platinum), family
  wallets, redemptions, win-back.
- **Concierge** — the AI capability layer + EU-14 allergen matrix.
- **Book** — slot + table in one move.

Parity target: today's `/core/guest`. Classes documented here when ported.
