# Core — Philosophy

← back to [Core README](../README.md)

Core is the productised IP. The philosophy diverges from Admin in
exactly one place — and that divergence is the whole point.

## The shared three (inherited)

Same triad as the rest of the system, same operating principle:

1. **Dieter Rams — "as little design as possible."** Hairlines, not
   boxes. Shadows describe elevation, not drama. A surface is what it
   is — a flat tone with a 1px line if it needs to separate.
2. **Jony Ive — material honesty.** Every element earns its place by
   the function it performs; ornamentation is the absence of judgement.
3. **Peter Thiel — second-order clarity.** The first read is what
   matters: a Core surface either tells the operator what to do in
   one beat, or it has failed.

## The Core override

**In high-pressure surfaces, operational clarity outranks brand
expression.**

This is the rule that makes Core different. On the storefront, Homepage
can breathe — beautiful empty space, brand flourishes, a hero that's
allowed to be slow. On Admin's back-office, the AdminShell can carry
moments of richness — the platinum mark, the warm-neutral surfaces, the
optional dark mode.

On Core, density wins. The KDS is reading from across the line through
grease film. The POS is the till at lunch rush — the cashier needs the
tender field to land in muscle memory. The Concierge is an AI surface
that has to be unambiguous. **Beauty doesn't get to slow them down.**

This means specific things:

- **Cards in Core are tight.** 12–14px padding, not 24px. Numerics
  large; chrome small.
- **Hover and idle states are visually quiet.** Hover lifts a 3% scrim,
  not a glow. There's no "delightful" micro-interaction on a station
  the operator hits 400 times per shift.
- **Colour is reserved for status.** The `--cmd-*` palette's status
  hues (queued, firing, warn, late, ready, risk) mean what they say —
  they aren't decoration. Re-using a status colour for branding
  *would* be a worse bug than no brand at all.
- **Type is workhorse-first.** Inter weights 500–700 for the numerals
  that matter (ticket id, tender total, ETA seconds); JetBrains Mono
  500 for code-like data (order numbers, tab tokens). Fraunces never
  appears on a Core surface.

## The single exception — emoji in Concierge

The EU-14 allergen pictograms (🌾 gluten, 🥛 milk, 🥚 egg, …) are
the **one place emoji appear in the system**. They're a recognised
domain convention — replacing them with custom stroke icons would lose
the legal-affordance value. See `../modules/concierge.md` for the rule.

## Resolving conflicts

When two principles disagree on a Core surface, **the operational
clarity rule wins**. A KDS rule that says "show one big number" beats
a brand rule that says "use the platinum stroke for elegant numerals".
A POS rule that says "tap targets are 56px" beats a material rule that
says "buttons are 40px".

When the same disagreement happens on Admin or Homepage, the brand
rule wins. That's the boundary.

## What this philosophy is not

- It is **not** "Core is ugly." Core is *quiet*. The discipline is
  itself the brand statement — a Ottaviano line reads as confident
  because nothing on the surface is fighting the operator.
- It is **not** "anything goes if it's fast." Every Core change still
  has to justify itself against the shared three above. The override
  only resolves the *conflict*, it doesn't waive the principles.

If an operator can't act in one read, the surface has failed. That's
the test.
