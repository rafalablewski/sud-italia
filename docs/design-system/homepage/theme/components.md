# Homepage — Components

← back to [Homepage README](../README.md)

The primitive vocabulary the storefront composes from. Same rule as
the other themes: **don't add casually**. Every Homepage primitive
lands on a brand surface where the guest is judging the operation.

## Operator-controlled visibility — `<LayoutGate />`

`src/components/layout/LayoutGate.tsx`. The client wrapper that lets
an operator turn any storefront component on or off from
`/admin/settings → Layout` without touching code.

```tsx
<LayoutGate flag="showBundlesShowcase">
  <BundlesShowcase />
</LayoutGate>
```

- Fetches `/api/settings/public` on mount (single-flight cache via
  `fetchPublicSettings()`), reads the named flag in `data.layout`.
- If `false`, returns `null` — the wrapped subtree drops out of the DOM
  (no painted CSS, no event listeners, no layout impact).
- If `true`, `undefined`, or the fetch fails, renders children — the
  fail-open default protects the storefront when settings are briefly
  unavailable.
- Works for both client and server children: the server still renders
  the child HTML inside the client boundary; the gate decides at
  hydrate time whether to keep it mounted.

The full list of supported flags is the union of `LayoutSettings` in
`src/lib/store.ts`. Adding a new toggle is three steps documented in
[`../../admin/sections/system.md`](../../admin/sections/system.md).
This is the storefront's CMS-style operator-visibility primitive —
every operator-toggleable storefront component should wrap through it
rather than rolling its own visibility logic.

## Form primitives (`.pub-*`)

The form-element classes declared in `themes/homepage/index.css`. Used
by every input on the storefront — cart drawer, address forms,
identity capture, notify-me forms.

### `.pub-input` / `.pub-select`

The standard text + select field.

- `width: 100%; padding: 0.625rem 0.875rem;`
- `border: 1.5px solid #e5e7eb; border-radius: 0.75rem;`
- `font-size: 0.875rem;` (14px — `body-sm` from typography)
- `background: #fff;` (white card on cream)
- Focus state: `border-color: var(--color-italia-red); outline: none;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-italia-red)
  12%, transparent);` — the brand-red ring is the storefront's
  consistent focus signal.

### `.pub-label`

The label that sits above a `.pub-input`.

- `display: block; font-size: 0.875rem; font-weight: 500;
  color: var(--color-foreground); margin-bottom: 0.375rem;`
- Inter 500, sentence case.

### `.pub-card`

Generic card container — used by the order-confirmation summary, the
rewards tier card.

- `background: #fff; border: 1px solid #f3f4f6;
  border-radius: 1rem;` (16px)
- Resting `box-shadow: 0 1px 3px rgba(0,0,0,0.04);`
- Hover: `box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform:
  translateY(-1px);`

## Shared UI components (in `src/components/ui/`)

These are JSX components shared across the storefront and (sparingly)
admin. They render Tailwind utilities that compile from the
`@theme inline` tokens.

### `<Button />` — `src/components/ui/Button.tsx`

The standard CTA button.

- **Primary variant:** `bg-italia-red text-white
  hover:bg-italia-red-dark active:bg-italia-red-dark` —
  burgundy fill, white text. The brand CTA.
- **Secondary variant:** `bg-white text-italia-red
  border border-italia-red hover:bg-italia-red/5` — outlined.
- **Ghost variant:** `text-italia-red hover:bg-italia-red/5` —
  text only.
- **Sizes:** `sm` (12px text, 8px / 16px padding), `md` (14px text,
  10px / 20px), `lg` (16px text, 12px / 24px), `xl` (18px text, 16px
  / 32px — hero CTA).
- All variants: 12px radius (rounded fully — `9999px` — for the
  hero CTA only).

### `<Sheet />` — `src/components/ui/Sheet.tsx`

The bottom-sheet / side-drawer primitive used by the cart drawer,
item detail drawer, mobile menus.

- Portalled to `document.body` (CLAUDE rule 4).
- Backdrop: `rgba(0,0,0,0.4)` scrim, tap-to-close.
- Enter motion: `--animate-slide-up-sheet` (350ms cubic-bezier).
- Title row: Fraunces 600 (`font-heading`), close button right.
- Body scrolls; footer is sticky for action affordances.

### `<Container />` — `src/components/ui/Container.tsx`

The page-width wrapper. `max-w-[1200px] mx-auto px-6`. Every section
on the storefront wraps in `<Container />` for consistent gutter.

### `<StarRating />` — `src/components/rating/StarRating.tsx`

The 5-star display for feedback + reviews.

- Filled star: `fill-italia-gold text-italia-gold`.
- Empty star: `fill-transparent text-italia-gold` (outline only).
- Half star supported via SVG mask.
- Inline rating count: `text-italia-gray` at body-sm.

### `<CurrencySwitcher />` — `src/components/ui/CurrencySwitcher.tsx`

The optional currency picker (governed by the future Layout-tab toggle
in admin Settings — when off, the component returns `null` and the
storefront falls back to PLN).

- Dropdown of supported currencies.
- Inline with the page header, right-aligned.
- Selected currency persists via the customer cookie.

## Landing-specific components (in `src/components/landing/`)

These compose the landing page. Each appears once per page; they
don't have alternate variants.

### `<HeroSection />`

- Full-bleed container, `bg-italia-cream-dark` or full-bleed image.
- Headline: Fraunces 600, display range (48–72px).
- Sub-headline: Inter 500, 18–20px.
- Primary CTA: `<Button size="xl" variant="primary" />`.

### `<LocationsGrid />`

- Grid of `<LocationCard />`s (defined locally).
- Each card: city, address, today-hours, status pill, `Order from
  {city}` CTA.
- Status pill colours: `bg-italia-green/10 text-italia-green` (open),
  `bg-italia-gold/10 text-italia-gold` (opens soon), `bg-italia-light-gray
  text-italia-gray` (closed).

### `<BundlesShowcase />`

- Horizontal scroll on mobile, grid on desktop.
- Each bundle card uses `<Sheet />` for detail expansion.

### `<AboutSection />`

- Two-column layout: copy left, image right (swaps on mobile).
- The one place body italic appears — a single Fraunces pull-quote.

### `<CTASection />`

- Centred final-call section, `bg-italia-red text-white` background.
- One large CTA button (the only place we use `<Button>` on a
  brand-red background — uses the white variant).

## Menu / cart components (in `src/components/cart/`, `src/components/location/`)

### Item card (in `<MenuSection />`)

- `pub-card` styling (`#fff` on cream, 16px radius, soft shadow).
- Image area (24px radius top) OR type-first if no photo.
- Name: Fraunces 500, 18px, `text-italia-dark`.
- Description: Inter 400, 14px, 2-line clamp, `text-italia-gray`.
- Price: Inter 700, 18px, tabular, with `zł` suffix at 14px.
- Dietary tags: inline chips (`bg-italia-cream-dark
  text-italia-dark text-xs px-2 py-0.5 rounded-full`).
- `Add` button: `<Button size="sm" variant="primary" />`.

### `<CartDrawer />` — `src/components/cart/CartDrawer.tsx`

The full checkout drawer (see [`../pages/checkout.md`](../pages/checkout.md)
for flow contract).

- Built on `<Sheet />`.
- Stages flow within the same surface — no page navigation.
- Bottom-sticky footer with the running total + primary `Continue`
  CTA.

### `<FloatingCartButton />` — `src/components/cart/FloatingCartButton.tsx`

The persistent in-thumb-reach order surface.

- Fixed bottom-right desktop, bottom-centre mobile (24px gutter from
  edge).
- `bg-italia-red text-white rounded-full`
- The **one** brand-tinted shadow on the storefront:
  `box-shadow: 0 4px 16px rgba(154,39,66,0.15)`.
- Renders nothing when the cart is empty (don't tease an empty cart).

### `<DeliveryProgress />`

The shimmer-sweep-unlock micro-flow for free delivery.

- Below threshold: shimmer crawls across a hairline progress bar
  (`--animate-delivery-shimmer`).
- At threshold: one-shot sweep + the medallion award
  (`--animate-delivery-sweep` + `--animate-delivery-medallion`).
- Unlock card pop: `--animate-delivery-unlock`.

## Loyalty components

### `<LoyaltyCard />` — `src/components/loyalty/LoyaltyCard.tsx`

The rewards-page centrepiece.

- `pub-card` styling, extra-generous 32px interior padding.
- Tier badge top, balance numeral 36px Inter 700, progress bar
  underneath, perks list at the bottom.

## Order tracker

### `<OrderTracker />` — `src/components/order/OrderTracker.tsx`

The polling live-status display on the order-confirmation page.

- 5-step horizontal pill row (stacks vertical < 480px).
- Current step: `bg-italia-red text-white`.
- Completed: `bg-italia-green/10 text-italia-green`.
- Future: `bg-italia-light-gray text-italia-gray`.
- ETA copy below the strip.

## What this component set is not

- It is **not** the Admin component set. The `glass-card`,
  `v2-btn`, `v2-input`, `v2-table` primitives live in
  `themes/admin/index.css`. Homepage doesn't use them.
- It is **not** the Core component set. The `cmd-*`, `ka-*`,
  `pos-*` primitives live in `themes/core/index.css`. Homepage
  doesn't use them.
- It is **not** customisable per page. A `<Button variant="primary" />`
  on the landing and a `<Button variant="primary" />` on the cart
  drawer render the same — the storefront's button consistency is the
  brand consistency.
- It is **not** a closed list — new primitives can land here, but
  they need a reason. A new "InfoBanner" component should probably
  just be a `<Sheet />` or a `pub-card` reused.

The Homepage component set is **the brand vocabulary on the
storefront** — type-first cards, brand-red CTAs, cream-and-white
cards, the delight moments (sheet, toast, delivery shimmer, tier-up
bounce).
