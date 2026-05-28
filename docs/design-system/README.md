# Sud Italia — Design System

Standards for the visual + interaction language across the whole operating
system: **POS, KDS, CRM, Concierge, WhatsApp**, every admin surface, and the
guest storefront.

**Code is the source of truth.** Canonical tokens live in
`src/app/globals.css` (the `[data-admin-theme]` blocks + the `:root --cmd-*`
command palette + the public `@theme inline` tokens) and are mirrored for
JS/Recharts in `src/components/admin/v2/theme.ts`. Reference mockups live at
`public/mockups/core-suite/` (open `/mockups/core-suite/index.html` on any
deploy).

## Map

**Foundations**

- [`philosophy.md`](./philosophy.md) — three ideas held together + the
  operating principle that resolves conflicts.
- [`color.md`](./color.md) — dark + light tokens, command palette, the colour
  rules ("no gradient, no glow", platinum = jewellery, brand ≠ status).
- [`typography.md`](./typography.md) — Inter / Fraunces / JetBrains Mono +
  the rule for where each face goes.
- [`material.md`](./material.md) — depth, hairlines, radius, motion.

**Components**

- [`components.md`](./components.md) — buttons, badges, inputs, segmented,
  cards, dialogs, tables, icons.

**Modules** (per-module rules)

- [`modules/kds.md`](./modules/kds.md) — calm monochrome + colour-on-exception
  + the role triad + coursing-aware tickets.
- [`modules/pos.md`](./modules/pos.md) — text-forward cards, coursing model,
  pace steering, tab rail.
- [`modules/crm.md`](./modules/crm.md) — health gauge, RFM, NBA, filters,
  GDPR.
- [`modules/concierge.md`](./modules/concierge.md) — AI capability layer +
  allergen matrix.
- [`modules/whatsapp.md`](./modules/whatsapp.md) — inbox + funnel + settings
  hub.

**Reference**

- [`canonical-orders.md`](./canonical-orders.md) — the demo order narrative
  (Table 7 = #4821, etc.) used coherently across all mockups.
- [`backlog.md`](./backlog.md) — not-yet-shipped, in priority order.
- [`extend.md`](./extend.md) — how to add a colour / surface / page / icon
  without drifting.

## Quick rules (the absolute don'ts)

1. **No decorative gradients.** Flat solids, hairlines for separation,
   neutral shadows for elevation. No `linear-gradient` fills on surfaces or
   buttons, no colour-tinted glow shadows.
2. **No emoji in UI chrome.** Use a custom stroke icon. (Exceptions: real
   chat-content emoji, and the EU-14 allergen pictograms in Concierge.)
3. **Burgundy is brand, never status.** A red ticket means *late*, not
   *brand*.
4. **Platinum is jewellery, not paint.** Hairlines, the wordmark mark,
   owner-tier flourishes, key numerals. Never as a fill or action colour.
5. **In high-pressure surfaces (POS / KDS), operational clarity outranks
   brand expression.** In exploratory surfaces (CRM / Concierge), beauty is
   allowed to breathe.
6. **One order = one number.** The same id everywhere (POS tender, KDS
   ticket, Guest hub pending) — see [`canonical-orders.md`](./canonical-orders.md).

## Authority

When this doc and the code disagree, the **code wins** — open a PR to fix
the doc. When the doc and a mockup disagree, the doc wins and the mockup
follows.
