# Homepage — Order (`/order-confirmation`)

← back to [Homepage README](../README.md)

The post-checkout surface — receipt + live tracking + loyalty +
post-order asks. Lives at `/order-confirmation?orderId={id}&location={slug}`
in `src/app/(public)/order-confirmation/page.tsx`. The visitor lands
here from the cart drawer's Stripe success; they may also return to
this URL via the order receipt link or push notification.

| Block                          | Component                                                  |
| ------------------------------ | ---------------------------------------------------------- |
| Success header                 | inline (CheckCircle icon + "Order confirmed")              |
| Order tracker (live status)    | `src/components/order/OrderTracker.tsx`                    |
| Loyalty points earned          | `src/components/order/LoyaltyPointsEarned.tsx`             |
| Customer milestone             | `src/components/order/CustomerMilestone.tsx`               |
| Push opt-in                    | `src/components/order/PushOptInButton.tsx`                 |
| Feedback survey                | `src/components/order/FeedbackSurvey.tsx`                  |
| Share / referral               | inline (`Share2` / `Link2` icons + copy)                   |
| Continue browsing CTA          | inline `ArrowLeft` link back to the location               |

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

- `CheckCircle` icon in `text-italia-green`, large.
- Headline: "Order confirmed" (Cormorant Garamond 600, 28px).
- Sub-line: "We'll have your order ready by {ETA}" — pulled from
  `OrderTracker`'s `getEstimatedTime(status)`.
- Order number prominently: `#{orderId}` (Lora 700, 22px, tabular).
  **Same number** appears on the POS tab, the KDS ticket, the receipt
  (canonical-orders rule — one order = one number).

### Order tracker — `<OrderTracker />`

The live, polling status display.

- **Five steps:** `pending` → `confirmed` → `preparing` →
  `ready` (pickup) or `out-for-delivery` (delivery) → `completed`.
- **Progress strip:** horizontal pill row, current step highlighted
  brand-red, completed steps in success-green, future steps in
  muted-grey.
- **Step copy** is friendly + factual — "We've got your order" /
  "Your pizza is in the oven" / "Hot and ready for pickup" — never
  jargon like "queued for fulfilment".
- **Polling:** every 10s via `/api/orders/{id}` (`useEffect` in
  `OrderTracker.tsx`). Stops polling at `completed`.
- **Estimated time** updates as the status advances —
  `getEstimatedTime(status)` returns the remaining-time line.
- **Delivery driver location** (when status is `out-for-delivery` +
  the driver app is integrated) shows in a small map below.

### Loyalty points earned — `<LoyaltyPointsEarned />`

The "by the way you earned points" surface.

- "You earned {N} points on this order" with the running balance and
  the tier-progress line ("8 points to Silver").
- If the order crosses a tier boundary, the component fires a
  one-shot `delivery-unlock` animation (per `themes/homepage/index.css`
  keyframes) — the same celebratory pattern used for free-delivery
  unlocks.
- **First-order earners** get a slightly different copy: "Welcome to
  the family — your first {N} points are in".

### Customer milestone — `<CustomerMilestone />`

Quiet, non-intrusive recognition.

- Triggers on round-number orders (5th, 10th, 25th, 50th, 100th) per
  the customer's lifetime count.
- "Your 10th order with us 🎉" (the one emoji exception on the
  storefront — *celebration only*, not status).
- Optional one-liner from the chef as a callback.

### Push opt-in — `<PushOptInButton />`

- Inline, non-modal. "Get a push when your order is ready" button.
- One-tap subscribes via the service worker (`ServiceWorkerRegistrar`
  in root layout). Browser-native permission prompt.
- **Already opted in?** Component renders nothing. Don't nag.

### Feedback survey — `<FeedbackSurvey />`

- Renders only after status reaches `completed`. Never before the
  order has actually been delivered / picked up.
- 5-star rating + optional text. 1–2 stars surfaces an additional
  "what went wrong?" field — the result feeds the admin Feedback
  surface ([`../admin/sections/customers.md`](../../admin/sections/customers.md)).
- Submission is fire-and-forget — no confirmation modal, just a small
  "Thanks for the feedback" inline.

### Share / referral

- Two inline buttons: `Share2` (native share API) + `Link2` (copy
  link with the referral code embedded).
- The referral link goes to `/r/{code}` which redirects to the
  landing with a banner crediting the referrer + offering the new
  visitor a small welcome perk (configured per loyalty settings).

### Continue browsing CTA

- Footer link: `← Back to {city} menu`. The only navigation out of
  the order surface besides the global header.

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
