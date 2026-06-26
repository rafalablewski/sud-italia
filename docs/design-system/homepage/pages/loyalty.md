# Homepage — Loyalty (`/rewards`)

← back to [Homepage README](../README.md)

The customer-facing loyalty surface — wallet, tier ladder, redemption,
challenges, referral, family wallet. Lives at `/rewards` in
`src/app/(public)/rewards/page.tsx`. Reads from `useCustomer()` for
identity + points; fetches the programme config (tier ladder + active
rewards catalogue) from `/api/settings/public` via
`fetchPublicSettings()` so operator edits to the programme config in
`/admin/growth` flow through without a deploy. The pure-compute helpers in
`src/lib/loyalty.ts` (`calculateTier`, `pointsToNextTier`,
`calculatePointsForOrder`) take the tier ladder as a parameter — no
hardcoded thresholds remain in the helper module.

V8 since Step 15 — all selectors live under `.v8-rewards-*` in
`themes/homepage/index.css`.

## The page contract

The rewards page is the **value-of-the-relationship surface**. It
answers three customer questions:

1. **What am I getting for being a regular?** (Tier card + perks.)
2. **What's the next thing I can redeem?** (Rewards grid with points
   required vs balance.)
3. **How do I earn more?** (Challenges + referral + family wallet.)

It is not a marketing surface. The customer is already opted in;
selling them the programme again is condescending.

## Section-by-section

### Sign-in screen (unauthenticated)

When `useCustomer()` returns no record yet — typically a visitor who
landed here from a marketing link, a footer link, or the cart drawer's
loyalty-invite chip.

- `.v8-rewards-signin-mark` — basil-tinted 88px circle with a filled
  Star SVG.
- `.v8-rewards-signin-h1` — italic Cormorant 38px *Soci e amici*
  headline (terracotta italic emphasis on the Italian phrase).
- `.v8-rewards-signin-sub` — italic Cormorant 17px sub-line:
  "Ottaviano Rewards — earn points, unlock perks, share with the
  famiglia."
- `.v8-rewards-signin-row` — phone input row: `.v8-rewards-signin-prefix`
  +48 capsule + parchment-cream `.v8-rewards-signin-input` + terracotta
  italic `.v8-rewards-signin-cta` "Sign in" button.
- When the phone isn't recognised after 300ms, `.v8-rewards-signin-card`
  fades in with the italic Cormorant "Nuovo qui?" prompt and a basil
  `Join · iscriviti` CTA — phone-only auto-enrolment, no password.
- `.v8-rewards-signin-hint` — italic Lora muted "Just your phone
  number — no password, no email required."
- **Install CTA** — below the hint, `<InstallAppButton appName="Ottaviano"
  tone="light" />` (`src/components/pwa/InstallAppButton.tsx`) offers
  "Install Ottaviano" so guests can keep the loyalty card on their home
  screen. It is theme-agnostic (inline brand-red styling, not a `.v8-*`
  form), self-hides when the app is already installed, and on iOS opens a
  portal how-to (Rule #4). One of the two installable PWAs — see the
  Capabilities ledger "Installable apps" group.

### Dashboard (authenticated)

The signed-in surface is the tier card + 4 tabs (Overview · panoramica
/ Rewards · premi / Achievements · traguardi / Offers · offerte).

#### Tier card — `.v8-rewards-tier`

The visual centrepiece + permanent header across all four tabs.

- **Espresso paper card** (`#3D2817` background with parchment text +
  ochre accents + ochre/terracotta radial washes via the `::before`
  and `::after` pseudo-elements). The **one** dark surface on the
  storefront — used here to mark the "card"
  metaphor as something the customer carries.
- **Top row** (`.v8-rewards-tier-top`): 44px round avatar circle
  (rgba parchment fill, ochre-light user glyph) + italic Cormorant
  nickname or name + tabular phone + italic ghost "Sign out" link
  in the top-right.
- **Body** (`.v8-rewards-tier-body`):
  - Left: 56px italic Cormorant ochre point count (tabular), italic
    Lora "punti — tier points earned" sublabel, italic Lora "Available
    to spend: {N} pts" line with the spendable value in Cormorant 600.
  - Right: `.v8-rewards-tier-pill` ochre rounded badge with the
    crown SVG + tier name + italic "famiglia" suffix + italic
    Lora "Nx multiplier" line beneath.
- **Progress to next tier** (`.v8-rewards-tier-progress`): hairline
  rail with an ochre→terracotta gradient fill. Labels above the rail:
  current tier on the left, italic Cormorant "{toNext} pts to {next}"
  on the right.
- **Stats row** (`.v8-rewards-tier-stats`) — 3-cell grid of
  semi-transparent stat tiles (Orders / Multiplier / Week streak).
- Platinum collapses the progress section ("at the top" implicit).

#### Tabs — `.v8-rewards-tabs`

Horizontal-scroll pill row. Each `.v8-rewards-tab` is a parchment pill
with italic Cormorant label + italic Lora Italian sublabel
(`Overview · panoramica`, `Rewards · premi`, `Achievements · traguardi`,
`Offers · offerte`). Active tab flips to terracotta fill + parchment
text with a soft drop-shadow.

#### Overview tab

The "what's going on with my account" view.

- `<FamilyWalletPanel />` (see below).
- Two-column grid (collapses to 1 on mobile):
  - **Profile card** (`.v8-rewards-card` with `<User />` glyph) —
    2-col field grid (First name / Last name / Nickname / Phone). The
    Edit link flips it into a form with parchment-cream inputs and a
    terracotta "Save · salva" CTA.
  - **Loyalty card** (`.v8-rewards-card` with `<Sparkles />`) —
    parchment-deep dashed card with a 5×5 SVG QR placeholder
    (`.v8-rewards-loyalty-qr` + center "SI" monogram) + italic Lora
    "Show at pickup · mostra al ritiro" + an espresso "Add to Apple
    Wallet" disabled CTA with an ochre "Soon" ribbon.
- `.v8-rewards-streak` — terracotta-ochre tinted card with a
  flame-gradient icon tile + italic Cormorant "2-week streak · due
  settimane" + italic Lora "Order again this week to keep it going.
  **3 weeks = +30 bonus pts.**"
- **Weekly challenges** (`.v8-rewards-challenges`) — 3-up grid of
  parchment cards (1-up on mobile). Each `.v8-rewards-challenge` has
  the italic Cormorant title + oxblood clock chip ("Nd"), italic
  Lora description, terracotta progress rail
  (`.v8-rewards-challenge-rail` + `-fill`), and a foot row with
  "n / N" on the left + ochre "+N pts" reward on the right.
- **Referral card** (`.v8-rewards-referral`) — basil-tinted paper
  card with italic Cormorant "Refer friends · invita gli amici"
  headline (oxblood italic accent), the dashed-border
  `.v8-rewards-referral-code` (Cormorant 22px tracking 2.8px), a
  copy chip that flips basil when clicked, and a terracotta italic
  "Share with friends · condividi" CTA. The PLN-off + bonus-points
  numbers come from `loyalty.referral` on the public-settings
  payload (`{ referrerPoints, refereeDiscountGrosze }`); the entire
  card hides itself when the operator sets `referral.active = false`
  in `/admin/growth → Referrals` — there's no static fallback copy.
- **Tier roadmap** (`.v8-rewards-roadmap`) — 4-up grid of
  `.v8-rewards-tier-tile` paper cards. Active tier gets the
  ochre-fill name pill + "Current · attuale" green sublabel + the
  ochre→terracotta-soft tile background. Locked tiers dim to 55%.
  Each tile lists the multiplier, the unlock threshold, and the
  tier's perks with basil check glyphs.

#### Rewards tab

- `.v8-rewards-balance` — ochre paper hero card with a 38px italic
  Cormorant point count + spendable-balance line.
- `.v8-rewards-grid` — 2-up paper grid of redeemable rewards. Each
  `.v8-rewards-reward` has the ticket-icon ochre tile + tabular cost
  + italic Cormorant name + italic Lora description. Affordable
  rewards get an ochre `Redeem now · riscatta` CTA; locked rewards
  collapse to a muted "Need N more pts" line with a lock glyph + the
  `.is-locked` opacity tweak.
- Affordability is read off `customer.spendablePoints`; the redeem
  CTA POSTs to `/api/customer/wallet/redeem` then re-`identify()`s to
  pull the new balance.

#### Achievements tab

- Two `.v8-rewards-section-title` blocks: **Unlocked · conquistati (N)**
  and **Locked · bloccati (N)**.
- `.v8-rewards-achievements` 2-up grid of `.v8-rewards-achievement`
  rows. Unlocked rows are ochre-tinted with the full-colour emoji
  glyph + name + description + ochre "+N pts earned" badge. Locked
  rows flip to `.is-locked`: parchment-deep with the emoji
  desaturated 70% and the points line reading "+N pts" (still
  earnable).

#### Offers tab

- **Combo deals** (`.v8-rewards-combos`) — 3-up grid of paper cards.
  Each `.v8-rewards-combo` has the italic Cormorant deal name + the
  ochre `−12%` chip + italic Lora description + italic
  category-list "Add X + Y + Z — applies automatically."
- **Tier perks** (`.v8-rewards-perks-card`) — paper card with the
  current tier badge + per-perk basil check rows + a dashed
  hairline "Reach {next}" block listing the next-tier perks as
  muted locked rows.
- **Refer-for-discount** (`.v8-rewards-refer-card`) — basil-ochre
  tinted hero card with an oxblood heart glyph in a parchment
  circle, italic Cormorant "Give X PLN, get Y pts" headline (oxblood
  italic emphasis), italic Lora sub, terracotta "Share code ·
  condividi" CTA.

### Family wallet — `<FamilyWalletPanel />`

Lives at the top of the Overview tab. Three states (all under
`.v8-rewards-wallet`):

- **No wallet** — basil-tinted "Create family wallet · crea
  famiglia" CTA. POSTs to `/api/customer/wallet/create`.
- **Wallet exists, myStatus = "pending"** — ochre confirm-code
  panel: italic Cormorant "Invito in attesa — you have a pending
  invite" + 6-digit input + espresso italic "Confirm · conferma"
  CTA. POSTs to `/api/customer/wallet/confirm`.
- **Wallet exists, myStatus = "active"** —
  - 2-up stats: `.v8-rewards-wallet-stat` "Pool earned · accumulati"
    (ochre italic) + "Available · disponibili" (espresso italic).
  - Members list — each `.v8-rewards-wallet-member` shows the crown
    glyph for the head, the phone in tabular Cormorant, a "pending"
    chip when applicable, the contributed-points value on the right,
    and (head only) an oxblood-on-hover remove chip with the
    UserMinus icon.
  - Head sees `.v8-rewards-wallet-invite` — a 6-digit phone input +
    terracotta italic "Invite · invita" CTA. POSTs to
    `/api/customer/wallet/invite`.
  - Members see a quiet underline "Leave this wallet · lascia" link.

Every business behaviour is preserved verbatim (create / invite /
confirm / remove / leave APIs, dev-mode invite-code surfacing,
refresh via `identify()` after every mutation).

## The rules unique to the loyalty page

1. **Programme config = admin settings, not code constants.** Tier
   labels, thresholds, multipliers, perks, and the rewards catalogue
   all live in `LoyaltySettings` (see `src/lib/store.ts`) and reach
   this page via `/api/settings/public` → `fetchPublicSettings()`.
   Never hard-code names ("Silver") or numbers (1000) in markup —
   read them from the loaded `loyalty` state. The page renders
   nothing until the public-settings fetch lands so we don't flash
   bronze defaults.
2. **The points balance is the actual ledger sum.** Order-based +
   manual admin adjustments (`getManualPointsTotal()`) — same number
   the admin Loyalty page reads.
3. **No "earn more" upsell after a redemption.** Redeeming a reward
   gets a thank-you toast and updates the balance — nothing nags the
   customer to immediately earn it back.
4. **No streak shaming.** If a customer hasn't ordered in 30 days,
   there's no "You've lost your streak" red banner. The challenges
   surface lapsed-customer reactivation, but the framing is positive
   ("Welcome back" not "You've been gone").
5. **No referral spam.** The referral block stays in its block — no
   pop-ups, no "share now!" interrupts elsewhere on the storefront.

## Mobile

- Single column. Tabs scroll horizontally; the tier card stacks the
  points and the badge vertically below ~640px (handled by the flex
  layout — no media query needed).
- Two-column Overview blocks (Profile + Loyalty card) collapse to
  one column under 768px.
- Rewards / Combos / Roadmap grids are 1-up at base, 2-up or 3-up
  at ≥640px.

## What loyalty is not

- It is **not** the admin loyalty surface. That's the Core Guest hub's
  Loyalty view, `/core/guest/loyalty` (member roster, family
  wallets, manual adjustments) — see
  [`../../core/modules/loyalty.md`](../../core/modules/loyalty.md).
- It is **not** account management. There's no account to manage —
  identity is the cookie, history is the order log.
- It is **not** a tier-comparison shopping experience. The customer
  sees their own tier + the next one; the full tier matrix is
  reference, not a marketing artefact.
- It is **not** a place to upsell. Points + tiers are the upsell, in
  the form of "stay engaged → unlock perks". Direct CTAs to order
  more are out of place.

The loyalty page is the **relationship-value receipt** — the
customer sees what their patronage has earned, and what's next.
