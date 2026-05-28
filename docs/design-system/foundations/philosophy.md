# Philosophy

← back to [README](../README.md)

Three ideas held together:

## 1. Dieter Rams — "as little design as possible."

Every element earns its place. Hairlines, not boxes. Shadows describe
elevation, not drama. A surface is what it is — a flat tone with a 1px
edge — and nothing more. When in doubt, take something away.

## 2. Jony Ive — soul through obsession.

Restraint is not sterility. Warmth in the palette, an optical serif on the
wordmark, the easing curve of a panel, a single platinum hairline under the
active lane — that is where the product stops feeling like a tool and starts
feeling considered.

## 3. Quiet power.

The system should feel like a proprietary advantage — **calm, fast, certain.**
Never loud. Confidence is shown by how little it needs.

The visual target is Bloomberg / Linear / Stripe Dashboard — **flat solids,
precise hairlines, neutral shadows, restrained colour, considered typography.**
Not gradients, not glow shadows, not glossy sheens, not playful emoji in UI.

---

## The operating principle that resolves conflicts

> *In high-pressure surfaces (POS, KDS) operational clarity outranks brand
> expression. In exploratory surfaces (CRM, Concierge, dashboards) beauty is
> allowed to breathe.*

When a kitchen ticket and a guest profile disagree about how loud a colour
should be, the kitchen wins on its own screen and the guest profile wins on
hers. Concretely:

- The KDS uses colour only as a signal (amber = approaching SLA, red =
  late). The whole brand vocabulary is suppressed there.
- The CRM relationship profile gets generous whitespace, Fraunces on the
  guest's name, soft platinum tier markers.
- The POS sits in the middle — dense and fast like KDS, but the menu cards
  can carry the serif dish-name like CRM.

This is the density spectrum. Same tokens, same components — what differs
per module is **how much of the system each surface uses,** not which system
it uses.

```
   glanceable / instant ←─────────────────────────→ exploratory / beautiful
   KDS ── POS ── Orders ── Inventory ── Reports ── Dashboard ── CRM ── Concierge
   (full brightness        (fast, dense          (data-viz       (whitespace,
    status, fast sans,      tables, one-tap       breathes)        serif accents,
    no animation,           actions,                              motion)
    colour=signal only)     no chrome)
```

## A design move only counts if it's restrained

A flourish in isolation can be tasteful. The same flourish on every screen
is decoration. **Pick the single surface a treatment belongs to and use it
there.** Fraunces is for the wordmark / hero / dish name — not body. The
platinum hairline is for the active lane — not every border. The burgundy
hero glow on a button is for the one CTA that takes money — not every
primary.
