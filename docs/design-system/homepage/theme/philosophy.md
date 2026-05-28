# Homepage — Philosophy

← back to [Homepage README](../README.md)

The storefront is a hospitality surface. Where Core optimises for the
operator's first read and Admin optimises for the manager's decision,
Homepage optimises for the guest's *trust* — that the food will be
good, the order will arrive, and the brand is run by people who care.

## The shared three (inherited)

Same triad — different emphasis:

1. **Dieter Rams — "as little design as possible."** The storefront
   inherits the discipline: no decorative gradients, no glow shadows,
   no carousel-of-promises hero. Every element earns its place.
2. **Jony Ive — material honesty.** Real food photography when it
   exists; type-first when it doesn't (the empty image-box pattern is
   forbidden — same rule as the menu admin). Cream paper texture is
   honest cream, not a noise filter.
3. **Peter Thiel — second-order clarity.** The guest doesn't read the
   page — they scan it. The first read either tells them what's here
   and how to order, or it has failed.

## The Homepage override

**Hospitality outranks density. Beauty earns its keep.**

This is the rule that makes Homepage different. On Core, density wins
because the operator is reading 12 tickets at a glance under time
pressure. On Homepage, the guest is on a phone on a Tuesday evening
deciding what to have for dinner — a calmer surface, more breathing
room, the brand allowed to *be* a brand.

This cashes out in specific ways:

- **Cards have generous padding.** 24–32px, not Core's 12–16px. White
  space is the substrate trust grows on.
- **Fraunces takes the lead on display.** Hero headlines, item names,
  section titles use the editorial serif — this is the Italian
  hospitality "soul" the brand sells.
- **Warm cream is the canvas, not cold white.** `--color-background:
  #FFF8F0` (the *italia-cream* token) — feels like Italian café
  paper, not a sterile e-commerce surface.
- **Brand red is a punctuation, not a fill.** `--color-italia-red:
  #9A2742` (deep burgundy / oxblood, not bright red) appears on
  CTAs, the wordmark mark, the tier-progress bar — never as a panel
  background.
- **Animation is allowed to delight.** The free-delivery shimmer +
  sweep + unlock, the cart-add bounce, the tier-up celebration —
  these are *moments*, not decoration. Spring physics are fine on the
  storefront in a way they aren't on Core.

## The "no friction" north star

CLAUDE rule 6 in this team is a design principle, not just a feature
spec: **zero-friction ordering.** No registration walls. No password
fields. Phone as identifier; email optional; loyalty auto-enrol on
first order. This shows up in:

- The cart drawer has no "Create an account?" upsell.
- The order-confirmation page has no "Save to your account" prompt
  (there's nothing to save it to).
- The rewards page works for unauthenticated visitors as a pitch and
  for authenticated visitors as a wallet — never asking them to
  authenticate explicitly.
- The chat widget answers questions without requiring identification
  first.

If a Homepage design proposal adds a step, a form, a wall, or a
"please" — it's wrong, regardless of how shiny the page looks.

## The "discoverable" rule

CLAUDE rule 5: **place new features in prominent, discoverable
locations.** On the storefront this means:

- Loyalty gets a dedicated `/rewards` page AND a section on the
  landing AND a section on every menu page. Not buried in a footer
  link.
- Seasonal items surface on the location menu page hero, not as a
  pop-up notification.
- New menu items get the "New" chip on the item card — not a
  separate "New menu items!" marketing page.

If a visitor would have to know to look, the placement is wrong.

## Resolving conflicts

When two principles disagree on a Homepage surface, **hospitality
wins over efficiency**. A more generous padding that means one less
item visible above the fold is the right call when it improves the
brand read.

When the conflict is between hospitality and the no-friction rule,
**no-friction wins**. A beautiful five-step onboarding wizard is
beautiful and *wrong*.

When the conflict is between hospitality and clarity, **clarity wins**.
A beautiful but unclear CTA loses to a plain but obvious one.

## What this philosophy is not

- It is **not** "Homepage can be slow." Beauty doesn't excuse weight.
  The storefront has performance budgets (LCP < 2.5s on mobile, CLS
  < 0.1) that are enforced; Fraunces is loaded via `next/font` for
  the same reason Inter is — fast.
- It is **not** "anything goes on the storefront." The shared
  no-emoji rule still applies (the cart's empty-state pizza glyph
  and the milestone 🎉 are the documented exceptions). The shared
  no-gradient rule still applies. Brand red is still burgundy, not
  Italia-flag-bright.
- It is **not** independent of the other themes. The
  `--color-italia-*` tokens drive `bg-italia-red` utilities used in
  shared components (Button, Sheet, StarRating) that Homepage owns
  but other surfaces reuse. Token changes ripple.

The Homepage is the **brand surface** — the first place a guest
forms an opinion about whether the food will be worth the trip.
