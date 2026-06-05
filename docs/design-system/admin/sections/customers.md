# Admin — Customers

← back to [Admin README](../README.md)

The four pages for the relationship layer on the admin side — note that
the **operational** relationship layer (Concierge, CRM book, Loyalty
roster, WhatsApp inbox) lives in the Core Guest hub. These pages are the
back-office view: the book of records, B2B accounts, post-order
feedback, and the NPS Pulse-survey board.

| Page                | Code                                              | Role-gate |
| ------------------- | ------------------------------------------------- | --------- |
| `/admin/customers`  | `src/components/admin/AdminCustomers.tsx`         | **staff+** (phone-order lookups) |
| `/admin/corporate`  | `src/components/admin/AdminCorporate.tsx`         | manager+  |
| `/admin/feedback`   | `src/components/admin/AdminFeedback.tsx`          | manager+  |
| `/admin/surveys`    | `src/components/admin/AdminSurveys.tsx`           | manager+  |

> **Loyalty moved to the Core Guest hub.** The member roster + family
> wallets + redemption log are now the **Loyalty** view of Guest
> Engagement (`/core/guest/loyalty`, its own nested route), rebuilt onto
> the Core suite theme — see
> [`../../core/modules/loyalty.md`](../../core/modules/loyalty.md). The
> programme **config** (tiers / rewards / referral) is still edited under
> [Growth](./growth.md).

The role gate matters: **customers are staff-visible** because phone
orders and till lookups need the record; **corporate + feedback are
manager+** because they touch pricing and reputation.

## Common rules across the section

1. **Passive identity, never sign-up walls** (CLAUDE rule 6). The
   customer record is built from observed data (phone at till, email at
   checkout, WhatsApp handle, recognised card). No account creation; no
   password fields.
2. **Per-channel GDPR consent.** A guest who consented to receive a
   WhatsApp reminder has *not* consented to email marketing. Every
   profile carries per-channel flags; every outbound module respects
   them.
3. **One ledger for loyalty.** Points earned at POS (order-based, 1 pt
   per PLN), online, or via manual admin adjustment (`getManualPointsTotal()`)
   are summed into one balance. Never split into "POS points" vs "online
   points". (The loyalty tier badge surfaces here; the roster + manual
   adjustment live in the Core Guest hub's Loyalty view.)
4. **RFM-style status, not "VIP / regular" labels.** Customer status is
   derived from observed order recency + frequency + monetary value
   (the visible "Status" column on `AdminCustomers`); never editable
   manually.
5. **Feedback is read-only** in admin — operators can flag, route, and
   resolve, but the customer's words don't get edited.

## Customers — `/admin/customers`

The book of records: every customer who paid, ranked by lifetime spend.

- **Header:** `Customers` (h1) + the subtitle line
  ("Every customer who paid, ranked by lifetime spend. RFM-style status
  calculated from order recency + frequency."), search, channel filter
  chips (`all` / `dine-in` / `takeout` / `delivery` / `whatsapp` /
  `voice` / `web`), `+ Add customer` (manual entry for phone orders).
- **Counts row:** total customers, active last-30d, at-risk count, lost
  count.
- **Table:** name + masked phone, channel(s) used, status badge (RFM),
  loyalty tier badge, lifetime spend, last order date, row actions
  (view profile, add note, flag).
- **Profile drawer:** opens in a portalled side sheet — full order
  history, channel timeline, loyalty balance, per-channel consent, free
  text notes, the merged-identity confidence score with the duplicate
  candidates if any.
- **Manual entry** is for phone orders ("table 7 just called") — phone
  number is required, name is required, email is optional. The record
  merges into an existing identity if the phone matches.

## Loyalty — moved to the Core Guest hub

The loyalty roster (members / family wallets / redemptions) + manual
point adjustment is now the **Loyalty** view of Guest Engagement
(`/core/guest/loyalty`), rebuilt onto the Core suite theme. Its
anatomy is documented at
[`../../core/modules/loyalty.md`](../../core/modules/loyalty.md). The
programme **config** (tier ladder, rewards catalogue, referral mechanics)
stays under [Growth](./growth.md) (`/admin/growth`).

## Corporate — `/admin/corporate`

B2B account book — companies with invoiced billing, dedicated rates,
named contacts.

- **Header:** `Corporate` (h1), search, status filter (`active` /
  `paused` / `archived`), `+ New account` primary.
- **Table:** company name + brand badge, primary contact, billing terms
  (NET 14 / NET 30 / pre-paid), monthly volume estimate, last order date,
  status badge.
- **Account drawer:** contacts list, billing details, contracted rate
  table (per item or per category), allowed locations, recent invoices,
  order history.
- **Contracted rates** are an override layer on top of the menu — the
  account sees their own price; the menu's listed price is unchanged.

## Feedback — `/admin/feedback`

The post-order review inbox.

- **Header:** `Customer feedback` (h1), status filter (`open` /
  `routed` / `resolved` / `dismissed`), source filter (`in-app survey`
  / `email reply` / `WhatsApp` / `Google review`), sentiment chips.
- **Table:** rating (1–5 stars), one-line excerpt, customer name +
  channel, order link, age, assigned-to, status badge.
- **Item detail:** the full feedback text (read-only — never edited),
  the related order, the customer profile, an internal-notes thread,
  a routing dropdown (assign to manager / chef / front lead), a
  resolution action with required note.
- **Auto-route hints** show on submit when the rating ≤ 2 or the text
  mentions an allergen — the routing dropdown pre-selects the right
  owner but the operator confirms.

## Pulse surveys — `/admin/surveys`

The NPS board. The companion to Feedback: where Feedback is the
detailed post-order review inbox, Pulse is the lightweight, always-on
voice-of-customer probe — one-tap 1–5★ micro-surveys fired across the
storefront (after ordering, on prolonged browsing, on exit intent, on
the rewards page, for returning visitors).

- **Header:** `Pulse surveys` (h1) with a title-level ⓘ `InfoButton`
  ("How Pulse surveys work" — the page-level five-part `MetricExplainer`,
  on-demand rather than a standing intro card) + subtitle. KPI row:
  **Pulse score** (NPS-style, with its own five-part ⓘ `MetricExplainer`
  per rule 12), avg rating, promoters (5★), detractors (≤3★).
- **Tabs:** Overview (rating distribution + responses-by-trigger bar
  charts) · Catalogue · Responses.
- **Catalogue:** the 12-survey seed table — question, the moment it
  **Fires on**, response count, avg, per-survey Pulse, and a **Live**
  `Switch`. Flipping it is the activation (toggle = saved, rule 7) — it
  PUTs `/api/admin/surveys` and the storefront picks it up via
  `/api/settings/public`. `trigger` is **not** editable: each value is
  wired to a concrete client signal, so a survey can never point at a
  moment that never fires (rule 1).
- **Responses:** newest-first, read-only — rating, the survey + trigger,
  comment, passive identity (or "Anonymous"), where, when.

Scoring (`computePulseScore` / `averageStars` in `src/lib/surveys.ts`,
the client-safe pure module shared with the storefront): promoter = 5★,
passive = 4★, detractor ≤ 3★; Pulse = `(promoters − detractors) / total
× 100`. Storefront delivery is the `<SurveyPrompt />` +
`<SurveyTriggerEngine />` pair documented in
[`../../homepage/theme/components.md`](../../homepage/theme/components.md);
the umbrella kill-switch is the `showNpsSurvey` Layout toggle.

## What Customers is not

- It is **not** the live relationship layer — searching, conversation,
  AI recommendations, and the loyalty roster live in the **Core Guest
  hub** (`/core/guest` — Inbox / Guests / Loyalty / Concierge / Book), which is
  the productised IP, not the admin back-office.
- It is **not** the loyalty roster — members / wallets / redemptions are
  the Guest hub's Loyalty view (`/core/guest/loyalty`).
- It is **not** marketing — campaigns, upsells, bundles live under
  Growth.
- It is **not** analytics — cohort, CLTV, segmentation live under
  Intelligence.
- It is **not** support tickets — feedback here is post-order signal;
  live support flows through the Guest hub's WhatsApp surface.

Customers is the **book of records + the B2B ledger + the feedback
inbox** — the back-office view of who we sell to.
