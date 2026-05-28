# Guest — the unified guest hub

One surface for the relationship layer. Three modules render into it,
each owning a slice of the guest lifecycle:

| Module                              | Slice                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| [`crm.md`](./crm.md)                | The customer book — every guest who leaves data, with health gauge, RFM, NBA, GDPR. |
| [`concierge.md`](./concierge.md)    | The AI capability layer + EU-14 allergen matrix exposed over MCP **and** WhatsApp. |
| [`whatsapp.md`](./whatsapp.md)      | The inbox + funnel + settings hub for the WhatsApp channel. |

← back to [Core README](../README.md)

## Why "Guest" and not three sidebar entries

The three modules answer one question — *who is this guest, and what
should we do next?* — across one shared customer graph (phone / WhatsApp
/ recognised card / web device / email, with confidence + duplicate-merge).

- **CRM** is the book — search, look up, read.
- **Concierge** is the brain — answers, recommendations, allergen safety.
- **WhatsApp** is the channel — the live conversation the brain is having.

They share the canonical customer record (`src/lib/store.ts` →
customers), the same identity-merge rules, and the same loyalty-points
ledger. Splitting them into three top-level surfaces in the nav forced
operators to context-switch for one job; the Guest hub presents them as
one surface with three views.

## Shared rules (apply to all three modules)

1. **One customer = one record.** Cross-channel identity merge runs on
   write (`/api/customer/identify`); never create a duplicate "WhatsApp
   customer" vs "POS customer" — the merge happens upstream.
2. **Passive identity.** Guests who arrive via WhatsApp/voice without
   signing up still get a profile with a confidence score. No sign-up
   wall (CLAUDE rule 6).
3. **Channel + time are first-class filters** in every list view (Dine-in
   / Takeout / Delivery / WhatsApp / Voice / Web × today / 7d / 30d /
   90d / all).
4. **GDPR consent is per-channel.** A guest who consented to WhatsApp
   marketing has not consented to email — the per-channel flag is
   surfaced on the profile and respected by every outbound module.
5. **Loyalty points** are the same ledger whether earned via POS, online
   order, or manual admin adjustment (`getManualPointsTotal()` in
   `src/lib/store.ts` is summed with order points).

## Mockups

The hub is mocked at `public/mockups/core-suite/index.html` — open
`/mockups/core-suite/` on any deploy. The CRM + Concierge + WhatsApp
surfaces all share `core-suite/system.css` so a token change paints all
three.

## What Guest is not

- It is **not** a marketing console — campaigns and growth experiments
  live under the Admin theme (`/admin/growth`, `/admin/upsell`,
  `/admin/crosssell`), not here.
- It is **not** a feedback tool — `/admin/feedback` is admin-owned and
  lives outside the Guest hub.
- It is **not** an analytics surface — cohort, CLTV, and menu engineering
  live under Admin → Intelligence.

Guest is the **operational** relationship layer — read the book, answer
the question, hold the conversation. Marketing analytics and campaign
tooling are admin concerns and live on the admin side.
