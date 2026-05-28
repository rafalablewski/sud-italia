# Homepage — Loyalty (`/rewards`)

← back to [Homepage README](../README.md)

The customer-facing loyalty surface — wallet, tier ladder, redemption,
challenges, referral. Lives at `/rewards` in
`src/app/(public)/rewards/page.tsx`. Reads from `useCustomer()` for
identity + points; reads `TIER_CONFIG` / `TIER_THRESHOLDS` / `REWARDS`
from `src/lib/loyalty.ts` as the source of truth.

## The page contract

The rewards page is the **value-of-the-relationship surface**. It
answers three customer questions:

1. **What am I getting for being a regular?** (Tier + perks card.)
2. **What's the next thing I can redeem?** (Rewards grid with points
   required vs balance.)
3. **How do I earn more?** (Challenges + referral.)

It is not a marketing surface. The customer is already opted in;
selling them the programme again is condescending.

## Section-by-section

### Unauthenticated state (no `customer.points`)

When `useCustomer()` returns no record yet — typically a visitor who
landed here from a marketing link without having ordered.

- **Headline:** "Earn rewards on every order" (Fraunces 700, 30px).
- **Sub-line:** "1 point per złoty. Free pizzas, drinks, and
  surprises. No app needed — just your phone number."
- **The "How points attach" explainer card** (rendered by
  `LoyaltyCard.tsx`):
  - "1 pt / 1 PLN" — earn rate.
  - "Earn points on every order" — clarity.
  - The tier ladder preview (Bronze → Silver → Gold → Platinum) as
    badges, no specific thresholds yet (avoids overwhelming a
    pre-customer).
- **Primary CTA:** `Start ordering` → links to the landing's
  locations grid. No "Sign up" — there's nothing to sign up *to*.

### Authenticated state (`customer.points >= 0`)

The four-block layout.

#### Tier + perks card

The visual centrepiece.

- **Tier badge** (Bronze / Silver / Gold / Platinum) at the top —
  uses `TIER_CONFIG[tier]` for label + colour. Bronze and Gold both
  read as warm metallics; the tier *label* disambiguates (matches the
  admin loyalty section's tone choice).
- **Balance:** "{points} pts" — Inter 700, 36px, tabular, with the
  unit at 14px trailing.
- **Progress to next tier:** a horizontal progress bar with the copy
  `{toNext} pts to {nextTierLabel}` — uses `pointsToNextTier()`.
- **Tier perks list:** 3–5 perks (free delivery, birthday treat,
  priority slots, surprise tastings) — read from `TIER_CONFIG[tier].perks`.
- **Platinum** has no `nextTier` — progress bar hides; "You're at
  the top — enjoy the platinum perks" replaces the progress copy.

#### Rewards grid — "Redeem your points"

- Cards from `REWARDS`, each: title, description, points required,
  redeem button.
- **Affordability state per reward:**
  - Affordable (`balance >= cost`): full colour, `Redeem` button
    primary.
  - Within reach (`balance >= cost * 0.7`): full colour, button shows
    `{cost - balance} pts to go`.
  - Distant (`balance < cost * 0.7`): muted, button shows
    `{cost} pts`.
- **Redemption flow:** confirmation dialog (portalled, per the admin
  + storefront portal rule), then API call, then a celebratory
  `delivery-unlock` keyframe on the affected card and a toast.
- **Categories:** items (free pizza / drink / dessert), experiences
  (chef tasting), perks (skip-the-line, named drink). Cards are
  not paginated — the full list fits.

#### Challenges section

The active-engagement layer.

- Active challenges (read from a `/api/customer/challenges` endpoint,
  or `loyaltySettings.challenges`): "Order 3 times this month",
  "Try a new pizza", "Bring a friend".
- Each challenge: title, progress (n / target), points reward, expiry.
- Progress visual: the same hairline progress bar pattern as the tier
  ladder.
- **Earned challenges** show as completed with the points already
  credited; visible for a week then archived.

#### Referral block

- "Share your link, earn together" headline.
- Personal referral link (`/r/{code}`) with a copy-to-clipboard
  button + native share button.
- The reward: "You and your friend both earn N points on their first
  order".
- **Earned referrals counter** at the bottom: "{count} friends joined
  through you".

## The rules unique to the loyalty page

1. **`TIER_CONFIG` and `TIER_THRESHOLDS` are the only source of
   truth.** Never hard-code the names ("Silver") or numbers (1000) in
   markup — read them from `src/lib/loyalty.ts`.
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

- Single column. Tier card collapses to a compact summary; tap to
  expand the perks list.
- Rewards grid is 1 column at `< 480px`, 2 at tablet.
- Bottom-sticky `Share my link` button when on the referral block.

## What loyalty is not

- It is **not** the admin loyalty surface. That's
  `/admin/loyalty` (member-list management, manual adjustments) — see
  [`../../admin/sections/customers.md`](../../admin/sections/customers.md).
- It is **not** account management. There's no account to manage —
  identity is the cookie, history is the order log.
- It is **not** a tier-comparison shopping experience. The customer
  sees their own tier + the next one; the full tier matrix isn't a
  marketing artefact here.
- It is **not** a place to upsell. Points + tiers are the upsell, in
  the form of "stay engaged → unlock perks". Direct CTAs to order
  more are out of place.

The loyalty page is the **relationship-value receipt** — the
customer sees what their patronage has earned, and what's next.
