# Hero redesign — concept mockups

Design R&D for the homepage hero, in response to audit §11.4 ("the hero is a
dark gradient… the competitor is showing you a Margherita on a wood peel under
sodium light"). **Not wired into the production app** — these are static
artifacts served from `public/mockups/` so they're viewable on any deploy
(open `/mockups/hero/`).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Gallery — open this first (`/mockups/hero/`) |
| `variant-a-wood-peel.html` | Bold: full-bleed, warm sodium-lit, pie centre-stage |
| `variant-b-split-editorial.html` | **Recommended** — parchment editorial left + pie right |
| `variant-c-ingredient-forward.html` | Centred pie with annotated ingredient callouts |
| `tokens.css` | Shared V8 palette + base components |
| `pizza.js` | Renders the self-contained SVG Margherita (seeded) |

## Notes

- Built on the real V8 tokens (parchment `#F8EFDE`, oxblood `#7A2B2B`,
  terracotta `#B85C38`) and the Cormorant Garamond + Lora type pairing.
- Each variant carries the live **Ready in ~15 min** chip, tying the hero to
  the operator-managed speed guarantee now wired through the cart.
- Imagery is rendered in **SVG** (no external photos) so the mockups are
  deploy-safe with zero broken-image risk. Production swaps in owned food
  photography at the same composition.
- The `/mockups/*` CSP (see `next.config.ts`) allows Google Fonts + `https:`
  images, so these render correctly under the deployed security headers.
