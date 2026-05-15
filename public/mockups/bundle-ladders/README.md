# Bundle ladders — 10 redesign sketches

Open any file directly in a browser. Each shows the same five bundles
(Family, Family Feast, Feast Deluxe, Lunch+, Late-night) in a different
layout so we can compare apples-to-apples before we pick one to ship.

| # | File | Idea | Best for |
|---|---|---|---|
| 1 | `01-card-grid.html` | Compact summary cards, click to expand into full editor | Operators who edit one tier at a time |
| 2 | `02-master-detail.html` | Linear-style sidebar list + right-pane editor | Power users navigating many tiers |
| 3 | `03-spreadsheet.html` | Dense inline table; edit cells in place | Operators who want a one-screen overview |
| 4 | `04-wizard-tabs.html` | Vertical tabs per concern (Identity / Pricing / Composition / Schedule / Audience) | Reduces cognitive load per screen |
| 5 | `05-live-preview.html` | Form on left, live customer-facing chip preview on right | Stripe / Notion design pattern |
| 6 | `06-accordion-compact.html` | Today's row layout but collapsed by default with a tight summary line | Small redesign, low-risk |
| 7 | `07-flat-minimal.html` | Notion-style: zero borders, deep whitespace, fields appear progressively | Calm, scannable |
| 8 | `08-ladder-drag.html` | Visual ladder with drag-handles; tiers reorderable | Merchandising-first thinking |
| 9 | `09-margin-dashboard.html` | Each tier as an analytics tile (price × margin × discount), edit via popover | Margin-aware operations |
| 10 | `10-mobile-first.html` | Single-column phone-friendly cards; all-caps section headers | Operators using a tablet on the floor |

All sketches are static HTML — no JS framework, no build step. They use
inline CSS so what you see is exactly what would ship.
