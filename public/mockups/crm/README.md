# public/mockups/crm

Customer Relationship Management (customer book + relationship profile)
direction, served on every deploy at `/mockups/crm/`. The companion to the
POS terminal in `../pos/` and the KDS gallery in `../kds/` — it reuses the
**shared POS + KDS visual language** (Inter + JetBrains Mono, the Atlas dark
canvas, the tone palette and the header/footer chrome) so the till, the line
and the customer book all read as one system.

The file is pure, self-contained HTML + inline CSS + inline JS — no build
step, no framework. The only external resource is the Google Fonts link
(permitted by the relaxed `/mockups/*` CSP in `next.config.ts`). What you see
in the browser is exactly what would ship.

## The chosen direction

| # | File | Direction |
|---|---|---|
| CRM | `regulars.html` | **Regulars** — dark · searchable customer book beside a deep relationship profile |

### Scope — this is more than a loyalty program

The CRM is the **system of record for every customer who leaves data**, not
only loyalty members. Someone who orders by **phone**, picks up **takeout**,
takes a **delivery**, or just wants a **receipt emailed** all leave a phone
number and/or an email — and we capture them. So the book holds two kinds of
people:

- **Members** — enrolled in loyalty, earning points and a tier.
- **Contacts** — captured at a touchpoint (phone order, email receipt, dine-in)
  but not enrolled. We still hold their data, track their health, and can
  **invite them to loyalty** in one tap.

Every profile makes the **data we hold vs. the data we still need** explicit
(a completeness meter + a "Collect email" action), because completing contact
records is a first-class job here. This honours the project's zero-friction
rule — collection happens naturally at receipt / order time, email stays
optional — while making the gaps visible and workable.

### Layout

**Regulars** is built on the idea that a food truck lives on its repeat
customers. The left column is **one book, split in two groups**: **Agentic
customers** (anyone who orders through an ordering agent — WhatsApp / Voice /
Web) and **Customers** (handled by staff at the table, window or door). No
separate "intake" mode. **Channel is a first-class, colour-coded dimension**: a
dedicated filter row (All / Dine-in / Takeout / Delivery / WhatsApp / Voice /
Web) plus a **Period** filter (All / 24h / 7d / 30d), with channel chips on
every guest row and profile and a colour per channel carried everywhere. The
book is searchable by name, phone or email, filterable by lifecycle (VIP /
Active / Repeat / New / Lapsed), **data facets** (Members / Contacts / No email
/ No-shows), **channel** and **time**, sortable by lifetime value, recency,
orders, points or name, with a KPI strip across the top. The right column is the
**relationship profile** for the selected customer:

- **Relationship health (the centrepiece)** — a redesigned radial **gauge**
  scoring the relationship 0–100, blended from **recency · frequency · monetary
  · reliability**, coloured green → amber → violet → red as a customer drifts
  toward churn (the same predictive-tier instinct as the KDS "Pace" layer). It
  carries a one-line diagnosis, the four factor meters, and risk/opportunity
  **flags**.
- **No-show warning** — if a customer has placed orders and **never picked them
  up**, the profile shows a red banner and a reliability %, the score is
  dragged down, and the row is flagged with `⚠`. There's a "No-shows" filter
  and KPI so a no-show pattern is never invisible.
- **AI next-best-action** — a churn-risk read plus the recommended move
  (confirm-pickup for repeat no-shows, win-back, **collect email**, birthday
  offer, **invite-to-loyalty**, welcome, VIP early-access, upsell), applied with
  one tap — the same violet AI card the POS uses for order offers.
- **Guest identity (passive)** — the truck's hard problem is that walk-ups don't
  "sign up", so every profile is a **merged guest** assembled from whatever
  signals a touchpoint leaves: phone, **WhatsApp/voice** (from the pre-order
  agent), a **recognised payment card** (card-present matched across visits), a
  **web device**, an email. An **identity-confidence** meter scores how sure we
  are it's one real person, and a **possible-duplicate** card offers a one-tap
  **merge**. No form, no password — identity is resolved from how they reach us.
- **Conversation history** — the guest's past chats stacked newest-first, each
  with two actions: **Preview** (opens the thread in a popup, read in place) and
  **Open** (hands off to the WhatsApp tab in the agent-commerce surface,
  `/mockups/agent/`, opening straight onto that guest's thread).
- **Loyalty brief** — tier, points balance, **reward value**, progress to the
  next tier, and the **claimable-now** + next rewards from the ladder (or a
  contact's invite card).
- **Lifetime stats**, **contact & data** (phone, email or collect, capture
  source, **the channels the guest uses** as colour chips, consent toggles —
  toggle = saved), **favourites**, **order history** and **notes**.

It runs end to end over a 12-customer sample book (8 members + 4 contacts;
8 agentic + 4 staff-channel) across Kraków + Warszawa in złoty: search, filter
by lifecycle / data facet / **channel** / **time**, sort, select a guest (mouse
or `↑`/`↓`/`j`/`k`), open their WhatsApp thread, award points, invite a contact
to loyalty, flag an email to collect, merge a duplicate identity, toggle
consent, add notes, and fire the next-best-action — all live.

## Browsing

- Locally: `npm run dev` → `http://localhost:3000/mockups/crm/`
- On any deploy: `/mockups/crm/`

`index.html` is the landing for the chosen direction; `regulars.html` is the
interactive surface.

> **Note:** like `../pos/` and `../kds/`, this is a *served* preview artifact
> referenced from design reviews. Next step: port **Regulars** into
> `src/components/admin` for an `/admin/crm` surface wired to the real customer
> rollup (`getAllCustomers()` / `CustomerRollup` in `src/lib/store.ts`), the
> loyalty points totals and the birthday/anniversary campaign triggers.
