# Guest — the unified guest hub

One surface for the relationship layer. Four modules render into it,
each owning a slice of the guest lifecycle:

| Module                              | Slice                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| [`crm.md`](./crm.md)                | The customer book — every guest who leaves data, with health gauge, RFM, NBA, GDPR. |
| [`loyalty.md`](./loyalty.md)        | The member roster + family wallets + redemption log; manual point adjustments. |
| [`concierge.md`](./concierge.md)    | The AI capability layer + EU-14 allergen matrix exposed over MCP **and** WhatsApp. |
| [`whatsapp.md`](./whatsapp.md)      | The inbox + funnel + settings hub for the WhatsApp channel. |

← back to [Core README](../README.md)

## Why "Guest" and not four sidebar entries

The four modules answer one question — *who is this guest, and what
should we do next?* — across one shared customer graph (phone / WhatsApp
/ recognised card / web device / email, with confidence + duplicate-merge).

- **CRM** (Guests) is the book — search, look up, read.
- **Loyalty** is the ledger — tiers, points, family wallets, redemptions.
- **Concierge** is the brain — answers, recommendations, allergen safety.
- **WhatsApp** (Inbox) is the channel — the live conversation the brain is having.

They share the canonical customer record (`src/lib/store.ts` →
customers), the same identity-merge rules, and the same loyalty-points
ledger. Splitting them into separate top-level surfaces in the nav forced
operators to context-switch for one job; the Guest hub presents them as
one surface with four views (Inbox / Guests / Loyalty / Concierge).

## Shared rules (apply to all views)

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

## How it's wired (live code)

- **Route:** `src/app/core/guest/page.tsx` is the single hub surface. It
  reads `?view=` and renders the matching module — `inbox` →
  `<AdminWhatsApp>`, `guests` → `<AdminCrm>`, `loyalty` →
  `<AdminLoyalty>`, `concierge` → `<AdminConcierge>` (the concierge
  server-side data load lives in the hub page). Default view is `inbox`.
- **Switcher:** `<GuestViewNav>`
  (`src/components/core/guest/GuestViewNav.tsx`) renders the
  Inbox / Guests / Loyalty / Concierge segmented links into the
  CoreShell topbar `.viewnav` slot. Each module drops it in with its own
  `current` view, and every module's breadcrumb reads
  **Guest Engagement** so the four read as one surface.
- **Redirects:** `/admin/crm`, `/admin/loyalty`, `/admin/concierge`,
  `/admin/whatsapp` are now thin `redirect()` pages pointing at
  `/core/guest?view=guests|loyalty|concierge|inbox`. The nav (Core group
  in `src/components/admin/v2/nav.config.ts`) carries a single
  **Guest Engagement** entry instead of four.
- **Responsive:** the mobile shell is retired (`useIsMobile()` is a desktop
  shim), so all three Guest modules render their `.core-suite` layout at
  every width and reflow in CSS — no separate `Mobile*` screens. Phone (<
  900px) collapses the Inbox 3-pane → 2 → 1, stacks Concierge and CRM to one
  column, and shrinks the CoreShell sidebar to a 52px icon rail. Breakpoint
  table in
  [`../theme/README.md`](../theme/README.md#responsive--phone--tablet--web).

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
- It hosts the loyalty **roster** (members / wallets / redemptions), but
  **not** the loyalty **programme config** — the tier ladder, rewards
  catalogue and referral mechanics are edited under Admin → Growth
  (`/admin/growth`). Loyalty here is operational, not configuration.

Guest is the **operational** relationship layer — read the book, answer
the question, hold the conversation. Marketing analytics and campaign
tooling are admin concerns and live on the admin side.
