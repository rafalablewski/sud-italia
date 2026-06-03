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
  pasta always get espresso + dessert). **Suppressed entirely while
  the bundle ladder is showing a real offer** — Chipotle "bundle is
  the path": one primary upsell path per cart moment, never the
  whole-meal ladder and the à-la-carte chips competing at once.
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
- **Minimum spend:** slots that the Demand Exchange has yield-capped carry
  a `minSpend` (grosze) from `/api/slots`, shown as a "min N zł" line on the
  tile. The minimum is **enforced server-side at checkout** (`createOrder`
  returns `below_min_spend` with a friendly message if the food subtotal is
  under it); the tile label is the upfront heads-up.
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

### Single-mount contract (Step 11 follow-up + Step 12)

The drawer is mounted **exactly once** at `(public)/layout.tsx`. Every
trigger surface — `<CartButton />` in the top nav,
`<FloatingCartButton />` floating bottom-right (Step 12, now layout-
level too), `<AbandonedCartBanner />` 30s after idle — opens the same
instance via `useCartUIStore.setDrawerOpen(true)`.

`<FloatingCartButton />` + `<AddToCartToast />` also live at the
layout level (Step 12) so they're available chain-wide — every
storefront route sees the same pill + the same toast instance, and
both fade behind `body.v8-cart-open` while the drawer is up.

| Slot              | Store / source                                  |
| ----------------- | ----------------------------------------------- |
| Drawer open state | `useCartUIStore.drawerOpen`                     |
| Menu items        | `useCartUIStore.menuItems` (seeded by `<MenuItemsRegistrar />` on `/locations/[slug]`) |
| Cart contents     | `useCartStore` (persisted; unchanged)           |

`<MenuItemsRegistrar menuItems={menuItems} />` is rendered once on
every page that has a live, override-aware menu in scope (today
that's `/locations/[slug]/page.tsx`). It hydrates the UI store on
mount and clears it on unmount so a back-navigation doesn't leak a
stale menu into the drawer.

The previous multi-mount setup (3 `<CartDrawer />` instances reading
the same Zustand state) was replaced because it duplicated all
audit-tied effects — slot polling, upsell-config refetch, attach
history fetch, compliance lookup — three times per cart open. The
single-mount drops those redundant calls and keeps the DOM clean.

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
  (`effectiveUnitPrice` × quantity — includes modifier surcharges).
- **`.v8-cart-item-origin`** — Lora italic muted, picks up
  `menuItem.description` so the cart row still tells the sourcing
  story (San Marzano DOP, fior di latte, basilico fresco).
- **`.v8-cart-item-mods`** — basil-tinted chip row
  (`.v8-cart-item-mod`) listing the line's chosen modifiers ("48h
  sourdough", "Half Diavola +6,00") resolved from
  `menuItem.modifierGroups`. Absent when the line has no modifiers.
- **`.v8-cart-qty`** — terracotta-tinted pill stepper (`− 1 +`).
  Decrement at 1 removes the line entirely (preserved behaviour). The
  stepper / remove / note all address the line by `cartLineKey` (item
  id + chosen options), so editing one modifier variant never touches
  another line of the same dish.
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

### Sub-components — all V8 (Step 11 + follow-up)

Step 11 ported the drawer shell + items + cross-sell + delivery
progress; the Step 11 follow-up ported the remaining seven
sub-components so the whole sheet reads as one paper-card
vocabulary. Every audit-tied wiring is preserved verbatim:

| Component                  | V8 selector family            | Audit tie-in                                                  |
| -------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `<LoyaltyEarnPreview />`   | `.v8-cart-loyalty-preview-*`  | Ochre star + italic point preview line in the paybar foot     |
| `<CorporateOrderBanner />` | `.v8-cart-corp-*`             | "Sud Italia per le aziende" rollup card (audit §3.4)          |
| `<TierPerkBanner />`       | `.v8-cart-perk-*`             | Famiglia Oro complimentary antipasto toggle (audit §2.2 row 6) |
| `<TodBanner />`            | `.v8-cart-tod-*` (.is-late)   | Time-of-day pairing card; espresso palette for the late window |
| `<ComboDealBanner />`      | `.v8-cart-combo-*`            | Italian Classic / Pasta Combo paper card with hairline progress |
| `<SlotPicker />`           | `.v8-cart-days-* .v8-cart-slot-*` | Date strip + slot grid with italic Lora scarcity copy     |
| `<BundleLadder />`         | `.v8-cart-ladder-*`           | Make-it-a-bundle paper card + primary CTA + chip ladder (audit §3.2) |

#### Notes on the bigger sub-components

- **BundleLadder.** The ladder still surfaces Lunch (hour-gated), Family
  Feast (mainItems gated), and Late dinner ladders. The header
  cycles between them via `.v8-cart-ladder-switch` when more than one
  qualifies; the primary tier renders as a full-width paper tile
  (`.v8-cart-ladder-primary`) with the "Most picked · il preferito"
  italic Cormorant pill, the secondary tiers as paper chips below
  (`.v8-cart-ladder-chip`). A `.v8-cart-ladder-hint` lands above the
  ladder when the cart is within `hintWithin` items of the Family
  Feast threshold. All funnel beaconing (impression /
  composer_opened / composer_abandoned), variant resolution, and
  composer-sheet handoff stays untouched. It also reports its
  on-screen state to the drawer via `onVisibilityChange` so the
  cross-sell rail can step aside (see the Cross-sell rail section).

- **ComboDealBanner.** When the cart is short of the combo, the card
  becomes an actionable button — tap adds the cheapest available
  items in the missing categories (or the missing required suffixes)
  and unlocks the discount. Mini hairline progress under the
  copy. Applied state flips to a basil-deep "applied · attivato —
  saving X zł" headline with a check tag.

- **SlotPicker.** The empty state lands as a parchment-deep dashed
  card with an italic Cormorant "Fully booked today · pieno" line +
  a terracotta italic day-rollover link. Slot scarcity now reads
  bilingual: "Only 2 left · ultimi 2", "Last spot · ultimo!". Loading
  state is a 6-slot shimmer skeleton with the
  parchment → parchment-deep gradient.

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
- **"Bundle is the path" suppression (audit elite-qsr §6).** The rail
  is hidden whenever `<BundleLadder />` reports a real offer on screen.
  The ladder fires `onVisibilityChange(true|false)` off the same
  `showLadder && visibleBundles.length > 0` compound that gates its own
  render, so the signal never drifts from what the customer sees; the
  drawer holds it in `bundleLadderShowing` and skips the rail (and its
  `showCartUpsell` `<LayoutGate>`) while it's true. When no ladder
  qualifies, the rail returns and the admin layout flag governs as
  before.

### Fulfilment toggle, address, dine-in

| Element                  | Selector                                                |
| ------------------------ | ------------------------------------------------------- |
| 3-up segmented toggle    | `.v8-cart-fulfill` + `.v8-cart-fulfill-btn` (`.is-on`)  |
| Address / email field    | `.v8-cart-field` + `.v8-cart-field-label` + `.v8-cart-input` |
| Delivery address autocomplete | `<AddressAutocomplete />` (`src/components/cart/AddressAutocomplete.tsx`) — `.v8-address-ac` wrapper + `.v8-address-ac-list` / `.v8-address-ac-option` (`.is-active`) dropdown. Wraps the same `.v8-cart-input`; suggestions come from `/api/address/autocomplete` (Google Places or OSM Nominatim, key server-side). Field stays free-text. |
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
lifts the `box-shadow`. The custom-amount input lives in
`.v8-cart-tip-custom` underneath; typing in it flips the picker into
custom mode (clears the preset highlight). The placeholder formats
zero through `formatPrice()` so the symbol tracks the customer's
selected display currency (zł / € / $ / S$). Tip values are still
stored in grosze on the Zustand cart, survive page refresh, and
clear on checkout — unchanged from the pre-V8 version.

### Pay bar

- **`.v8-cart-paybar`** — sticky bottom band with a parchment
  gradient + 3px Italian-flag stripe on top + `0 -12px 30px -16px
  rgba(61,40,23,0.35)` editorial drop shadow.
- **`.v8-cart-totals`** — one row per line item (Subtotal, combo
  discount, Delivery, Mancia, GST, Ready-by). Combo-discount rows carry
  `.is-discount` (basil-deep + italic). The total row carries
  `.is-total` (dashed hairline above + oxblood 21px tabular).
  The `.is-ready` row (clock icon + "Ready · pronto") surfaces the
  pre-pay ETA in basil-deep: "by HH:MM" once a slot is picked (the slot
  time is the kitchen's promised-ready), or "in ~N min · pick a time"
  beforehand. The estimate comes from `estimatePrepMinutes` in
  `src/lib/eta.ts` — the same formula the KDS SLA is held to.
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
- Flat delivery fee (when the cart is below the threshold) reads
  from `AppSettings.deliveryFee` — the drawer pulls it off
  `fetchPublicSettings().deliveryFee` and passes it as the fourth
  arg to `computeDeliveryFee`, server-side checkout
  (`lib/checkout/createOrder.ts`) reads it via `getSettings()`,
  and the WhatsApp quote in `lib/whatsapp/tools.ts` does the same.
  Operator edits at `/admin/settings → Delivery fee` flow to all
  three surfaces from the next request.
- Sold-out item gate disables the pay CTA + surfaces a remove prompt.
- Slot scarcity FOMO note flips between "Pick your time" and "Time
  selected" once `selectedSlotId` is set.
- Stripe handoff route + post-success redirect to
  `/order-confirmation?orderId=...&location=...` is identical.
- Weekly-usual intent capture fires before the Stripe redirect when a
  bundle is locked + the checkbox is on.
- PDPA §13 consent + NYC FRESH Act packaging disclosure surface in
  the paybar foot per `compliance.zone`.
