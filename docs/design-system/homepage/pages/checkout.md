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
