# Backlog — not yet shipped

← back to [README](./README.md)

**Cross-theme.** This list spans Core, Admin, and Homepage — each item
notes its owning theme. Theme-specific backlog also lives in each
theme's `theme/README.md`; this file is the cross-cutting inventory.

Things that belong in the design system but aren't done. Listed in
**rough priority order** — top of the list ships first when we open a
design-cleanup window.

## P0 — consistency leaks visible on a careful pass

### 1. Row heights → a 48px standard

Some admin tables read 44px, some 48px, some 52px. Pick **48px** as the
canonical compact row, codify it as `--row-h-compact` and `--row-h: 56px`
as the comfortable variant. Then sweep:

- `AdminOrders.tsx` table → 48px
- `AdminCustomers.tsx` book rows → 48px
- `AdminPos.tsx` ticket lines → keep current (specialised)
- `AdminKDS.tsx` not affected (cards, not rows)

### 2. Inline `font-size` literals → token references

A handful of components still set `font-size: 13px` / `14px` inline.
Replace with `var(--text-sm)` / `var(--text-base)` so the type ramp
lives in one place.

`grep -rn 'font-size:' src/components/admin/` to find them — there are
~20 stragglers.

### 3. Hairline colour normalisation

Two ad-hoc hairlines exist beyond `--border` / `--border-strong`:
`rgba(255,255,255,.08)` and `rgba(0,0,0,.06)` in the public storefront.
Map them onto the token system (`--border-soft`, new) and update
references.

## P1 — mobile completeness

### 4. Mobile variants for capability surfaces

`Mobile<X>.tsx` exists for KDS / Orders / Customers but not for:

- Concierge (no mobile view at all today)
- Capabilities (admin page)
- AI / Expansion / Compliance pages

Build virtualised list + sheet-style profile for at least Concierge,
since operators will glance at the capability toggles from their phone.

### 5. Pull-to-refresh on the WhatsApp inbox mobile view

`MobileWhatsApp.tsx` already exists; add the same PTR + native share
patterns the CRM mobile view uses.

## P2 — React port of the locked mockups

The mockups under `public/mockups/core-suite/` are the **canonical
reference** for the redesign. Port them into the live components:

- `pos.html` ←→ `AdminPos.tsx` — text-forward menu cards, coursing
  toggle, drag-to-recourse, footer ETA
- `kds.html` / `kds-fleet.html` / `kds-chef.html` ←→ `AdminKDS.tsx`
  family — calm-monochrome ticket, whole-board scroll
- `guest.html` ←→ `AdminWhatsApp.tsx` — three-pane inbox, KPI strip,
  live order context + funnel checklist
- `guest-crm.html` ←→ `AdminCustomers.tsx` — Fraunces name, health
  gauge, NBA panel, GDPR footer
- `guest-concierge.html` ←→ `AdminConcierge.tsx` — capability inspector,
  EU-14 allergen matrix, MCP / WhatsApp view toggle

Once each is shipped, the mockup becomes a regression reference, not a
spec.

## P3 — depth pass on the storefront

The public storefront (`/`, `/menu`, `/order/*`) is functional but
hasn't been through the same refinement as admin:

- Replace placeholder product imagery (still using emoji on some
  cards) with the same text-forward pattern when photos aren't ready
- Apply the new button system (no gradient, no glow, 7px radius, 1px
  defining edge) across storefront CTAs
- Map storefront colour tokens onto the unified `@theme inline` block
  so dark mode comes for free

## P4 — real food photography

The text-forward menu card is the **bridge** pattern, designed to look
intentional until real photography exists. When it does:

- Replace `.phead` icon + Fraunces title with a 4:3 hero crop on
  storefront cards (keep the title under, not over, so type leads)
- Keep the POS card text-forward — operators don't need the photo, and
  the iPad screen real estate is precious
- KDS never gets photos (already established)

Pull tower-shot photos from one professional Pizzaiolo session per
location; budget ~10 hero dishes + 4 antipasti + 3 dolci.

## P5 — illustration system

We have no illustrations; many premium SaaS suites have a quiet
hand-drawn or geometric set for empty states + onboarding. Brief:

- Single-line stroke, platinum
- Subjects: a copper pot, a wood-fired oven, a pizza peel, a Vespa
  (delivery), an espresso cup
- Used **only** for empty states + the splash screen, not as
  decoration on populated pages

This is explicitly **optional** — the design system survives without
it. Don't ship it unless it adds.

## P6 — content style guide

The voice on the system is consistent but it's living in implicit
patterns. Codify:

- Verb-first action labels ("Charge", not "Pay now")
- Plain numbers in the body, mono numerals in tables/totals
- Modifier copy as menu-room writing ("+ extra 'nduja · well-fired"
  italic serif, not "EXTRA NDUJA")
- Allergen language ("Allergens: milk · gluten", lowercase, dot
  separator)

A `docs/voice.md` could host this — but until then this bullet list is
the record.

## Done — moved out of backlog

Things that used to live here and now ship:

- **Calm-monochrome KDS** — done. Tickets neutral by default, colour
  escalates only with SLA.
- **Text-forward POS cards** — done. Uniform 2-line reserves, prices
  align across every card.
- **Coursing model** — done. Per-order `Coursed` vs `All together`,
  drag-to-recourse, KDS chip + section headers.
- **One brand identity** — done. Burgundy + platinum + steel +
  Fraunces + Inter, every surface now sings the same tune.
- **The design system itself** — this folder.

## How to use this list

When a quiet design-polish slot opens:

1. Pick the top unticked item.
2. Open a focused PR (one item per PR).
3. Update the doc to move the item to "Done" in the same PR.

When you discover a new inconsistency, add it here — but with a
reproduction step and a proposed resolution. A backlog item without
those is just a complaint.
