# Homepage — Checkout (the cart drawer)

← back to [Homepage README](../README.md)

Checkout on Sud Italia is **not a separate page**. It's a sequence
inside the cart drawer (`src/components/cart/CartDrawer.tsx`) that
slides over the menu page — the visitor never leaves their context.
The flow is: cart review → fulfilment → identity → payment →
confirmation.

| Stage           | Component(s)                                              |
| --------------- | --------------------------------------------------------- |
| Cart review     | `CartDrawer.tsx`, `CartItem.tsx`, `CartUpsell.tsx`, `ComboDealBanner.tsx` |
| Fulfilment      | `SlotPicker.tsx` (pickup / delivery + date / time)        |
| Address         | `pub-input` form fields for delivery only                 |
| Identity        | Phone + optional email (`useCustomer()`)                  |
| Payment         | Stripe Elements via `/api/checkout`                       |
| Confirmation    | Redirects to `/order-confirmation?orderId=...`            |

## The flow contract

The cart drawer is the **only checkout surface**. Specifically:

1. **No registration wall** (CLAUDE rule 6). Phone is the identifier;
   email is optional. No password fields anywhere in the drawer.
2. **One drawer, multiple stages.** The drawer doesn't navigate to
   new pages — it cycles through stages within itself. The visitor's
   browser back button takes them back to the menu, not to a previous
   checkout step (which would lose state).
3. **State persists.** Cart contents live in the Zustand store
   (`src/store/cart.ts`); the customer cookie (`sud-italia-customer`)
   carries phone + name + optional email across sessions. A returning
   visitor's cart is still there.
4. **Validation is inline, not blocking.** Phone too short → red text
   under the field, not a modal alert. The `Continue` button stays
   disabled until valid; never a "please fix the form" toast.
5. **Discounts must subtract from the actual total**, not just
   display (CLAUDE rule 8 + `getActiveComboDeals`). The drawer's
   total line is the same number that hits Stripe.

## Stage-by-stage

### Cart review

The default state when the drawer opens.

- **Empty state:** centred pizza glyph, headline "Your next meal is
  waiting", primary CTA `Browse menu` (closes drawer). Inviting, not
  preachy.
- **Item rows** (`<CartItem />`): thumbnail (or type-first if no
  photo), name, modifiers list, quantity stepper, price, remove (×).
- **Sold-out items** in the cart (validity re-checked on open) get a
  disabled state + red "Sold out — remove" annotation. The visitor
  can still see what they had.
- **Cross-sell rail** (`<CartUpsell />`) shows below the items —
  espresso / dessert recommendations driven by
  `src/lib/upsell.ts :: getCartSuggestions` (CLAUDE rule: pizza /
  pasta always get espresso + dessert).
- **Combo deal banner** (`<ComboDealBanner />`) appears when the
  current cart qualifies for a combo discount — shows the discount
  amount inline AND it lands in the total.
- **Loyalty earn preview** (`<LoyaltyEarnPreview />`) — "You'll earn
  N points on this order" — non-blocking, just informative.
- **Free-delivery progress** (`<DeliveryProgress />`) shows for
  delivery orders below the free-delivery threshold; uses the
  `--animate-delivery-*` keyframes for the shimmer/sweep/unlock
  moments.
- **Bottom of drawer:** subtotal, applied discounts, total
  (Lora 700, 22px, tabular), primary `Continue` CTA.

### Fulfilment — `<SlotPicker />`

- **Mode toggle:** segmented control `Pickup` / `Delivery` (the latter
  shown only for locations that deliver).
- **Date strip:** today + next 6 days as a horizontal scroll of pills;
  current day default.
- **Slot grid:** time slots for the selected date pulled from
  `/api/slots?location={slug}&date={date}&type={pickup|delivery}`.
- **Slot states:** `available` (selectable), `selected` (highlighted
  brand-red), `unavailable` (greyed, disabled), `peak` (still
  selectable, tagged "filling up").
- **No slots message:** "All slots are booked for this day —
  try another date" with the date strip still visible.
- **Slot selection persists** even if the visitor switches between
  pickup / delivery (within the same date) when both modes have the
  selected slot available.

### Address (delivery only)

- Line 1, line 2, city (pre-filled from location), postcode, delivery
  notes.
- `<pub-input>` styling per the Homepage form element rules in
  `themes/homepage/index.css`.
- Address-zone validation: when the postcode falls outside the
  location's delivery radius, show "We don't deliver here yet — try
  pickup instead" with a one-tap switch to pickup mode.

### Identity

- Phone (required, formatted as the visitor types).
- Name (required).
- Email (optional, with a small "We'll only use this for the receipt"
  reassurance under the field).
- **Existing customer detection:** if the entered phone matches an
  existing record (`/api/customer/identify`), the name auto-fills and
  a subtle "Welcome back" pill appears. Edit is allowed in case of
  typo.
- **No "Create an account?" upsell.** The customer record is built
  passively; there's no concept of an account to create.

### Payment

- Stripe Elements embedded directly in the drawer. Card / Google Pay
  / Apple Pay buttons render based on platform support.
- **Order summary** stays visible above the payment block — the
  visitor never loses sight of what they're paying for.
- On confirm: POST to `/api/checkout` with the cart + customer +
  slot + payment intent; on success, redirect to
  `/order-confirmation?orderId={id}&location={slug}`.
- **Decline handling:** Stripe's error surfaces inline; the visitor
  can retry without losing cart state.

## The rules unique to checkout

1. **No third-party tracker pixels in the drawer.** Conversion
   analytics ride server-side off the `/api/checkout` confirmation,
   not client-side tags. Avoids consent-banner shenanigans during the
   most fragile part of the funnel.
2. **The Continue button text is action-specific** — `Continue to
   slot`, `Continue to details`, `Pay 87.40 zł`. Never just
   `Continue`. The visitor knows what they're committing to.
3. **No upsells after the cart review stage.** Once the visitor is in
   slot / address / payment, the only goal is finishing. Cross-sell
   rails disappear; combo banners stay collapsed (just the achieved
   discount line).
4. **Stripe receives the same total as the drawer displays.** A
   visible mismatch is a refund and a trust killer. The total line
   ties to the Stripe `amount` field via the same computation.
5. **Drawer escape is always one tap.** The × in the top-right
   closes back to the menu, the cart contents preserved. ESC works
   too. No "are you sure you want to leave?" interrupt — friction is
   the enemy.

## Mobile

The drawer is a bottom sheet on mobile (full viewport height).
- Slot picker becomes vertical: date strip horizontal-scroll across
  top, slots vertical-scroll below.
- Payment block sticky at the bottom so the Pay button stays in thumb
  reach.
- Stripe Elements render in their mobile-optimised mode.

## What checkout is not

- It is **not** a separate `/checkout` route. There's no SPA-style
  multi-page checkout — the drawer is the whole flow.
- It is **not** a wizard with a progress bar. Stages flow naturally
  without numbered steps. Progress bars on a 5-step checkout are an
  admission the flow is too long.
- It is **not** a place to capture marketing consent. The phone field
  is for order updates only; explicit per-channel marketing consent
  is captured on the order-confirmation page (after success).
- It is **not** the order page. Once Stripe confirms, the visitor
  goes to `/order-confirmation` for the receipt + live tracking
  ([`order.md`](./order.md)).

The cart drawer is the **complete checkout surface** — minimum
friction, maximum trust, one slide-over from the menu.

## V8 Trattoria visual — Step 11

The drawer's chrome is the Tuscany-trattoria paper-card vocabulary
introduced in Steps 1-10. The selector family lives under
`.v8-cart-*` in `src/app/themes/homepage/index.css` and is owned by
`CartDrawer.tsx` (the drawer no longer composes through the generic
`<Sheet />` primitive — it builds its own portalled sheet so the
parchment-paper feel can extend edge-to-edge inside the panel).

### The shell

| Element                        | Selector                                     |
| ------------------------------ | -------------------------------------------- |
| Backdrop scrim                 | `.v8-cart-overlay`                           |
| Panel                          | `.v8-cart-sheet` (slide-up mobile / side desktop) |
| Drag affordance bar            | `.v8-cart-grip`                              |
| Sticky paper header            | `.v8-cart-top` + `.v8-cart-basil` sprig      |
| Italian-flag hairline          | `.v8-cart-tricolore`                         |
| Scroll region                  | `.v8-cart-scroll`                            |
| Editorial section title        | `.v8-cart-section-title` (Cormorant 13/2.4px) |
| Sticky paybar                  | `.v8-cart-paybar` + `.v8-cart-paybar-tricolore` |

The sheet sizes to `96vh` on mobile (leaves a 4vh parchment breathing
strip at the top so the underlying nav stays slightly visible — the
mockup's "near-full-screen" pattern) and `calc(100vh - 40px)` on
desktop with a 460/520px max-width. Portalled to `document.body` per
Rule 4. `body.v8-cart-open` is toggled while the sheet is up so the
floating cart pill and nav can fade out without rolling their own
state.

### Items list — `CartItem.tsx`

Each row is `.v8-cart-item` and carries:

- **`.v8-cart-item-illus`** — 64×64 parchment-deep tile with an
  inline hand-sketched glyph per category (pizza, pasta, dessert,
  drinks, coffee, antipasti, panini). Glyphs come from the
  `DishGlyph` helper inside `CartItem.tsx` — pencil-style SVG that
  matches the V8 mockup's per-item illustrations.
- **`.v8-cart-item-name`** — italic Cormorant 20px espresso. The
  dish name reads like a menu entry, not a UI label.
- **`.v8-cart-item-price`** — Cormorant 600 tabular ink, line total
  (price × quantity).
- **`.v8-cart-item-origin`** — Lora italic muted, picks up
  `menuItem.description` so the cart row still tells the sourcing
  story (San Marzano DOP, fior di latte, basilico fresco).
- **`.v8-cart-qty`** — terracotta-tinted pill stepper (`− 1 +`).
  Decrement at 1 removes the line entirely (preserved behaviour).
- **`.v8-cart-item-action`** — italic text buttons under the row:
  `note · nota` (toggles the note panel) + `remove · rimuovi`
  (oxblood on hover).
- **`.v8-cart-note`** — parchment-cream textarea that opens below
  the row when the note button is tapped; max 140 chars; the
  character counter lives on the right of the note foot.

### Loyalty status — inline in the drawer

The audit §2.2 row-9 chip:

- **Known customer:** `.v8-cart-loyalty` ochre-tinted strip with a
  filled basil-deep star, italic Cormorant first name, ochre
  tabular point balance.
- **Unknown customer:** `.v8-cart-loyalty.is-invite` parchment-deep
  card linking to `/rewards` ("Soci e amici. Points follow the
  phone you enter below — tap to sign in.").

### Sub-components retained (audit-tied)

These render inside the V8 sheet at their current visual treatment.
They have audit-tied behaviour that Step 11 keeps untouched; each
will be ported to V8 in a follow-up step:

- `<CorporateOrderBanner />` — Sud Italia for businesses upsell
- `<TodBanner />` — time-of-day "Aperitivo hour" pairing
- `<TierPerkBanner />` — Gold/Platinum complimentary antipasto
- `<BundleLadder />` — Festa di famiglia ladder + Make-it-a-Lunch
- `<ComboDealBanner />` — percentage-deal banner (Italian Classic, etc.)
- `<LoyaltyEarnPreview />` — "You'll earn N points" inline preview
- `<SlotPicker />` — date strip + slot grid

The audit §2.5 free-delivery progress bar **does** get the V8 port
in this step — see below.

### Free-delivery progress — `DeliveryProgress.tsx`

Reskinned to V8 while keeping the audit §2.1 animations:

- **Below threshold:** `.v8-cart-delivery` — italic Cormorant
  "Consegna a casa — N% verso la gratuità" headline + terracotta
  rail + the cyclist SVG rides the fill (the rider is positioned
  with `left: {pct}%`). The fill carries
  `.v8-cart-delivery-shimmer` running the `--animate-delivery-shimmer`
  keyframe so motion still catches the eye.
- **At threshold:** `.v8-cart-delivery.is-unlocked` — the celebratory
  card with the gold→basil `.v8-cart-delivery-medallion` and the
  one-shot `--animate-delivery-sweep` overlay. The animations are the
  same ones declared in `themes/homepage/index.css` since Step 1;
  the V8 markup just re-points the existing keyframes at the new chrome.

### Cross-sell rail — `CartUpsell.tsx`

Reskinned from the four-pill horizontal slider to a vertical
sommelier rail:

- **`.v8-cart-pairs-kicker`** — "Tonight's pairing · l'abbinamento
  di stasera" Cormorant 600 uppercase.
- **`.v8-cart-pairs-title`** — italic Cormorant 22px "Pairs
  beautifully with —".
- **`.v8-cart-pair`** rows — 56×56 illus tile + italic Cormorant
  name + italic Lora "reason" copy + tabular price + terracotta
  italic `+ Add · aggiungi` text button. Once added, the button
  flips to basil-deep `added · aggiunto ×N` and stays tappable for
  another increment (mirrors the audit §2.2 chip behaviour).
- Wired through the same `getCartSuggestions()` upstream ranking
  with `PairingContext` (hour-of-day + per-customer attach history).

### Fulfilment toggle, address, dine-in

| Element                  | Selector                                                |
| ------------------------ | ------------------------------------------------------- |
| 3-up segmented toggle    | `.v8-cart-fulfill` + `.v8-cart-fulfill-btn` (`.is-on`)  |
| Address / email field    | `.v8-cart-field` + `.v8-cart-field-label` + `.v8-cart-input` |
| Phone with +48 prefix    | `.v8-cart-phone` + `.v8-cart-phone-prefix`              |
| First/last grid          | `.v8-cart-name-grid`                                    |
| Kitchen notes            | `.v8-cart-textarea`                                     |
| Dine-in party-size panel | `.v8-cart-party` + `.v8-cart-party-stepper`             |

Each button on the fulfilment toggle carries the EN/PL label on top
and an italic Italian translation (`asporto`, `consegna`,
`a tavola`) below, in line with the V8 bilingual voice.

### Tip picker

The terracotta pill grid from the mockup (`.v8-cart-tips` 4-up:
`0% · no thanks`, `10% · kind`, `15% · generous`, `20% · family`).
Active state darkens the terracotta + adds an ochre inset stroke +
lifts the `box-shadow`. The custom-zł input lives in
`.v8-cart-tip-custom` underneath; typing in it flips the picker into
custom mode (clears the preset highlight). Tip values are still
stored in grosze on the Zustand cart, survive page refresh, and
clear on checkout — unchanged from the pre-V8 version.

### Pay bar

- **`.v8-cart-paybar`** — sticky bottom band with a parchment
  gradient + 3px Italian-flag stripe on top + `0 -12px 30px -16px
  rgba(61,40,23,0.35)` editorial drop shadow.
- **`.v8-cart-totals`** — one row per line item (Subtotal, combo
  discount, Delivery, Mancia, GST). Combo-discount rows carry
  `.is-discount` (basil-deep + italic). The total row carries
  `.is-total` (dashed hairline above + oxblood 21px tabular).
- **`.v8-cart-paybar-foot`** — slim italic note strip for the
  `<LoyaltyEarnPreview />` line + NYC FRESH Act packaging text + SG
  PDPA §13 consent text. Hidden via `:empty` when none apply.
- **`.v8-cart-pay-cta`** — full-width terracotta "Pay · procedi
  · 46,51 zł". Disabled state goes muted-brown + low-shadow when the
  guard fails (no slot, missing identity, sold-out items).
- **`.v8-cart-pay-clear`** — line-bordered trash square next to it,
  triggers `confirm()` → `clearCart()`.
- Weekly-usual checkbox (`.v8-cart-weekly`) renders only when a
  bundle is locked in, exactly as the previous sprint 9 #2 wiring.

### Empty state

`.v8-cart-empty` — parchment-deep tomato glyph + italic Cormorant
"Your table is set" + italic Lora copy + terracotta `Browse menu ·
il menù` CTA that closes the drawer back to the menu.

### Footer flourish

The `.v8-cart-foot` block at the bottom of the scroll region:

> *&ldquo;Mangia bene, ridi spesso, ama molto.&rdquo;*
> SUD ITALIA · KRAKÓW · WARSZAWA

### Behaviour contract preserved

Every audit-tied behaviour from the pre-V8 drawer still holds:

- Cart store reads (`useCartStore` items / total / quantities /
  bundle lock / tip amount).
- Combo deal discount subtracts from the actual total when no
  bundle is locked (`getActiveComboDeals` + `comboDiscount`).
- Per-segment free-delivery threshold matches what
  `/api/checkout → computeDeliveryFee` charges
  (`getDeliveryThresholdForCustomer`).
- Sold-out item gate disables the pay CTA + surfaces a remove prompt.
- Slot scarcity FOMO note flips between "Pick your time" and "Time
  selected" once `selectedSlotId` is set.
- Stripe handoff route + post-success redirect to
  `/order-confirmation?orderId=...&location=...` is identical.
- Weekly-usual intent capture fires before the Stripe redirect when a
  bundle is locked + the checkbox is on.
- PDPA §13 consent + NYC FRESH Act packaging disclosure surface in
  the paybar foot per `compliance.zone`.
