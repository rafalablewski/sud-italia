# Homepage — Order (`/order-confirmation`)

← back to [Homepage README](../README.md)

The post-checkout surface — receipt + live tracking + loyalty +
post-order asks. Lives at `/order-confirmation?orderId={id}&location={slug}`
in `src/app/(public)/order-confirmation/page.tsx`. The visitor lands
here from the cart drawer's Stripe success; they may also return to
this URL via the order receipt link or push notification.

V8 since Step 14 — all selectors live under `.v8-order-*` in
`themes/homepage/index.css`.

| Block                          | Component                                                  | V8 selector(s)                              |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------- |
| Page canvas                    | inline                                                     | `.v8-order-page`                            |
| Success header                 | inline (basil-tinted check + italic Cormorant headline)    | `.v8-order-success`, `.v8-order-success-mark`, `.v8-order-success-id` |
| Order tracker (live status)    | `src/components/order/OrderTracker.tsx`                    | `.v8-order-tracker`, `.v8-order-step`, `.v8-order-tracker-eta` |
| Order summary                  | (inside `OrderTracker`)                                    | `.v8-order-summary`                         |
| Pickup location                | inline                                                     | `.v8-order-pickup`                          |
| Loyalty points earned          | `src/components/order/LoyaltyPointsEarned.tsx`             | `.v8-order-loyalty`                         |
| Post-order upsell              | `src/components/order/PostOrderUpsell.tsx`                 | reuses `.v8-cart-pairs`, `.v8-cart-pair*`   |
| Bundle value feedback          | `src/components/order/BundleFeedbackPrompt.tsx`            | `.v8-bundle-feedback*` (reuses `.v8-order-card`) |
| Limited-time come-back card    | inline                                                     | `.v8-order-comeback`                        |
| Customer milestone             | `src/components/order/CustomerMilestone.tsx`               | `.v8-order-milestone`                       |
| Push opt-in                    | `src/components/order/PushOptInButton.tsx`                 | `.v8-order-push`, `.v8-order-push-confirmed`|
| Feedback survey                | `src/components/order/FeedbackSurvey.tsx`                  | `.v8-order-feedback*`                       |
| Pulse micro-survey (NPS)       | global `src/components/survey/SurveyPrompt.tsx` (fired post-order) | `.v8-pulse-*` (portalled to `body`)  |
| Share / referral               | inline (`Share2` / `Link2` icons + copy)                   | `.v8-order-review-link`, `.v8-order-action` |
| Continue browsing CTA          | inline `ArrowLeft` link back to the location               | `.v8-order-action.is-primary`               |

## The page contract

The order page is the **trust + retention surface**. Its three jobs:

1. **Confirm the order succeeded** — receipt-grade reassurance with
   order number, items, total, ETA.
2. **Hold the visitor's attention while the food is being made** —
   live tracker that updates without a page refresh.
3. **Quietly grow the relationship** — points earned, optional push
   opt-in, optional referral share, optional feedback after pickup.

It is *not* a marketing surface. It is *not* an upsell surface. The
order has been placed; the visitor's job is to wait, and ours is to
make the wait feel handled.

## Section-by-section

### Success header

- `.v8-order-success-mark` — basil-tinted 76px circle with the
  CheckCircle SVG, pop-in animation (`@keyframes v8-order-pop` —
  custom keyframe declared in `themes/homepage/index.css` alongside
  the success block).
- `.v8-order-success-h1` — italic Cormorant 36px "Order confirmed"
  headline.
- `.v8-order-success-sub` — italic Cormorant 17px sub-line with the
  terracotta italic *"Grazie!"* emphasis: "Grazie! Thank you for
  your order."
- `.v8-order-success-id` — order number in a parchment-deep pill
  (Cormorant 600 13.5px tabular). **Same number** appears on the POS
  tab, the KDS ticket, the receipt (canonical-orders rule — one
  order = one number).

### Order tracker — `<OrderTracker />`

The live, polling status display.

- **Three visible steps** + the `pending → completed` terminal states.
  The visible steps are rendered as a vertical editorial stack
  inside `.v8-order-tracker-steps`:
  - Step dots (`.v8-order-step-dot`) are 48px circles. Future steps
    sit on parchment-deep with muted-brown text; completed steps flip
    to basil-fill + parchment glyph with a basil drop-shadow; the
    active step is terracotta-fill with a pulsing scale animation
    (`@keyframes v8-order-step-pulse`); a `.is-pending` active step
    (status hasn't been confirmed yet) tints ochre instead of
    terracotta so the customer can read "we have your order, we're
    waiting for the truck."
  - Each step carries a bilingual italic Cormorant label
    (`Confirmed · confermato`, `Preparing · in preparazione`,
    `Ready · pronto`) + an italic Lora description (`"Our pizzaiolo
    is making your food."`). The active step adds a tiny `Current`
    pill (`.v8-order-step-current`) in terracotta — ochre when the
    pending hold is active.
  - A dashed-line vertical rail (`.v8-order-tracker-rail`) connects
    the dots; a basil fill (`.v8-order-tracker-rail-fill`) grows in
    height as steps complete.
- **Live tracking row** at the top of the tracker
  (`.v8-order-tracker-status`) — basil-deep pulsing dot
  (`@keyframes v8-order-ping`) + italic "Live tracking · in diretta"
  + a refresh chip. The dot + label both swap to oxblood when the
  order is `cancelled` (`.is-cancelled`).
- **Estimated time card** (`.v8-order-tracker-eta`) — terracotta-
  tinted paper card with a clock SVG, the editorial "ESTIMATED ·
  STIMATO" uppercase Cormorant label, and the time value in oxblood
  italic Cormorant 22px ("10-15 min", "Ready now!").
- **Order summary** (`.v8-order-summary`) — paper card with the
  bilingual "Your order · il tuo ordine" title, the fulfilment chip
  (`.v8-order-summary-mode`) with the icon + label + party-size suffix,
  one row per line item, and the dashed-hairline total line with
  the oxblood Cormorant 22px tabular total.
- **Polling:** every 10s via `/api/orders?orderId=...`. Polling
  continues for the lifetime of the mount; the API is cheap and a
  terminal-state response just keeps returning the same data.
- **Last-updated stamp** (`.v8-order-tracker-updated`) — small italic
  Lora muted line that only renders client-side (`suppressHydrationWarning`
  guard + null initial state) so the SSR'd HTML doesn't disagree with
  the hydrated render about which second it is.

### Loyalty points earned — `<LoyaltyPointsEarned />`

The "by the way you earned points" surface.

- `.v8-order-loyalty` — ochre paper card with a 38px italic Cormorant
  `+N` count, bilingual italic "points earned · punti guadagnati"
  suffix, balance + tier line below ("Balance: 47 pts · Bronze" with
  the tier in oxblood italic), small italic Lora footer reminding
  the customer the points are credited to the phone on the order.
- Display only — the server is the source of truth for the credited
  balance.

### Customer milestone — `<CustomerMilestone />`

Quiet, non-intrusive recognition. Triggers on 1st / 5th / 10th /
25th / 50th lifetime orders.

- `.v8-order-milestone` — ochre paper card with the same pop-in
  keyframe as the success mark. 56px parchment-circle holds the
  milestone icon (Star / Trophy / Gift / PartyPopper); italic
  Cormorant `<em>Bravo,</em> {firstName}!` headline; bilingual
  italic body copy with the Italian phrase in muted italic
  (`"5 orders — you're becoming a regular." · cinque visite, ci sei`);
  ochre "ORDER N° X" uppercase Cormorant footer.

### Push opt-in — `<PushOptInButton />`

- `.v8-order-push` — ochre-bordered paper pill: italic Cormorant
  "Notify me when ready · avvisami" with a Bell glyph. Error state
  flips the border to oxblood + swaps the glyph to BellOff.
- Already-subscribed state renders `.v8-order-push-confirmed`
  instead — a basil-tinted strip: "You'll get a push when your order
  is ready · *quando è pronto*".
- Hides entirely when VAPID isn't configured, the browser doesn't
  support push, or the customer has denied permission.

### Post-order upsell — `<PostOrderUpsell />`

- Live code: `src/components/order/PostOrderUpsell.tsx`. Reuses the cart
  pairing surface (`.v8-cart-pairs`, `.v8-cart-pair`, `.v8-cart-pair-add`)
  rather than adding new selectors, so the confirmation cross-sell reads
  identically to the cart drawer's "Pairs beautifully with —" rail.
- Fetches `/api/upsell/post-order?orderId=` — the same `getCartSuggestions()`
  engine, seeded with the just-placed order and filtered to additive items
  (anything already on the order is dropped). Renders nothing when there are
  no suggestions.
- Tapping **Add · aggiungi** drops the item into the (now empty) cart store;
  once anything is added a terracotta `.v8-order-action.is-primary` CTA links
  back to `/locations/{slug}#menu` to complete a quick follow-on order.
- Gated by `<LayoutGate flag="showPostOrderUpsell">` (Settings → Layout →
  Order confirmation). Default on.

### Bundle value feedback — `<BundleFeedbackPrompt />`

- Live code: `src/components/order/BundleFeedbackPrompt.tsx`. Voice-of-
  customer (audit elite-qsr §2): the one question the bundle audit log
  can't answer — "was the value good?".
- **Self-gating** — fetches `GET /api/customer/bundle-feedback?orderId=`
  and renders **nothing** unless the order was a bundle order, so the page
  mounts it unconditionally. No `LayoutGate` (it's already conditional on
  bundle orders, a small slice).
- A `.v8-order-card` with `.v8-bundle-feedback-q` (italic Cormorant "How
  was the value? · il valore") + `.v8-bundle-feedback-sub`, then two
  `.v8-bundle-feedback-btn` thumbs — `.is-up` (basil hover) / `.is-down`
  (oxblood hover). Tapping POSTs `{ orderId, rating }`; the rating is
  optimistic (the `.is-done` thank-you never waits on the network). The
  bundle id / name / location are resolved server-side from the order's
  BundleEvent so the client can't spoof them.
- Aggregated thumbs-down rate per bundle surfaces on the admin Reports
  `BundleAnalyticsCard` "Value" column (see admin
  [`finance.md`](../../admin/sections/finance.md)).

### Feedback survey — `<FeedbackSurvey />`

- Renders inside `.v8-order-card` + `.v8-order-feedback*` — a 3-step
  wizard inside a single paper card:
  - **Step 1 (items)**: italic Cormorant "Rate your dishes · vota i
    piatti", a parchment-deep `.v8-order-feedback-row` per ordered
    dish with the dish name + a `StarRating`. Rated rows flip to
    basil-tinted `.is-rated`. Terracotta "Next · avanti" CTA disabled
    until every row is rated.
  - **Step 2 (overall)**: italic Cormorant "Overall experience ·
    l'esperienza", three categories (Speed · velocità / Service ·
    servizio / Value · valore) each with an emoji glyph + label +
    StarRating, a free-text textarea in parchment cream, terracotta
    "Almost done · quasi fatto" CTA.
  - **Step 3 (email)**: italic Cormorant "Receipt by email? · ricevuta
    via email", optional input + terracotta Submit CTA with the
    paper-airplane glyph + bilingual "invia" suffix. A small muted
    "Skip — just submit my review" link sits underneath when the
    email is blank.
- Submission posts to `/api/feedback` fire-and-forget; failure is
  swallowed so the customer always reaches the thank-you screen.
- **Thank-you state** (`.v8-order-feedback-thanks`) — basil-tinted
  check mark + italic Cormorant "Grazie! Thank you for your review."
  + ochre "+10 loyalty points · punti aggiunti" callout.
- The submission feeds the admin Feedback surface
  ([`../admin/sections/customers.md`](../../admin/sections/customers.md)).

### Pulse micro-survey (NPS) — `<SurveyPrompt />` (fired post-order)

- **Not a page-local component.** This is the global storefront Pulse
  prompt (`src/components/survey/SurveyPrompt.tsx`, portalled to
  `document.body`, `.v8-pulse-*`) documented in full under
  [`../theme/components.md`](../theme/components.md). The order page only
  *fires* it: ~6s after the receipt lands, `useSurveyStore.request(
  "post-order")` is called so the single-question pulse (e.g. "How easy
  was placing your order?") slides in **beside** — never on top of — the
  detailed `<FeedbackSurvey />`.
- The two are complementary: `<FeedbackSurvey />` is the deep, per-dish
  review; the Pulse prompt is the one-tap NPS read on the *process*.
- Frequency-capped by the engine (one prompt per session, 8h global gap,
  per-survey cooldown) and gated by `<LayoutGate flag="showNpsSurvey">`
  at the layout level, so it can be absent entirely. Answers POST to
  `/api/surveys` and feed the admin Pulse board
  ([`../../admin/sections/customers.md`](../../admin/sections/customers.md)).

### Limited-time come-back — inline

`.v8-order-comeback` — italic Cormorant "Seasonal specials go fast ·
stagionali" callout with two italic terracotta + basil text links
("Browse menu · *il menù*" / "Invite friends · *invita gli amici*").
The only retention nudge on the page; honors the "no upsells after
success" rule because both links go to surfaces the customer would
visit anyway (the menu + the rewards page).

### Share / referral

- `.v8-order-review-link` — small italic Lora "Review later:
  ottaviano.pl/review/{id}" line with the link in terracotta italic
  (tabular).
- `.v8-order-actions` — flex row (column on mobile) of
  `.v8-order-action` buttons: terracotta primary "Order again ·
  ordina ancora" pointing back to the location, two parchment ghost
  buttons "Share · condividi" + "Back home · alla casa".

## The rules unique to the order page

1. **No upsells after success.** The order is placed; pushing more
   would feel desperate. Cross-sell + combo banners that lived in the
   cart don't appear here.
2. **The tracker is read-only.** Visitors can't cancel from this page
   — cancellation is a phone call to the location (number in the
   header). Reduces accidental cancels.
3. **Push opt-in fires once per session, max.** If declined, don't
   re-render the button in this session. If approved, render nothing.
4. **The feedback survey waits for completion.** Showing "how was it?"
   before the food has been served is the rudest possible UX. The
   survey component literally returns `null` until `status === "completed"`.
5. **Polling stops at terminal states.** `completed` or `cancelled` →
   the `useEffect` cleanup stops the 10s interval. No background
   network noise on a finished order.

## Returning later

The URL is **shareable + bookmarkable** — the customer can return
hours later to see the order history. The tracker shows the
terminal state; the feedback survey appears if it wasn't completed.
A push notification sent at `ready` deep-links straight back here.

## Mobile

- Single column, generous padding. Tracker pills stack into a
  vertical timeline below ~480px.
- Share buttons become bottom-sticky bar so they're thumb-reachable.
- Feedback survey expands the text field full-width.

## What the order page is not

- It is **not** a re-order surface. A future "order again" feature
  would live here, but today the surface is post-order observation +
  retention, not re-purchase.
- It is **not** a support surface. Order issues route through the
  feedback survey (1–2 stars) or the location's phone number. There's
  no in-page chat support button (the global `ChatWidget` covers
  pre-purchase questions; post-purchase issues need human contact).
- It is **not** an account page. There's no account; identity is the
  cookie. The order page reads `useCustomer()` to personalise but
  doesn't link to a "My account" surface (none exists).

The order page is the **post-purchase trust surface** — confirm,
track, retain, in that order.
