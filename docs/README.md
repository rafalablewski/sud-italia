# docs

Internal design + audit documents. Code is the source of truth; these
exist to explain *why* decisions were made and *what* the next step is.

## Layout

```
docs/
├── README.md         ← you are here
├── mobile/           ← mobile admin redesign — strategy → audit → next
└── audits/           ← dated, scoped audits of specific surfaces
```

## `mobile/`

The mobile-admin redesign, in reading order:

1. **`audit.md`** — what existed before, where mobile broke down
2. **`ux-strategy.md`** — the strategic shape of the mobile experience
3. **`navigation.md`** — bottom-nav, more-drawer, FAB, role filtering
4. **`design-system.md`** — tokens, primitives, ergonomic patterns
5. **`final-review.md`** — adversarial review of the shipped redesign
6. **`next-steps.md`** — punch-list of what's not yet shipped

Clickable HTML mockups for the same work live at
`public/mockups/mobile/` — load any deploy at `/mockups/mobile/`.

## `audits/`

Dated audits of specific concerns. Format: `YYYY-MM-<topic>.md`. Each
audit is self-contained — the conclusions may be superseded by later
work but the document is left intact as a historical record.

Current audits:

- `2026-05-admin-dashboard-audit.md`
- `2026-05-bundle-ladder-revenue-rebuild.md`
- `2026-05-elite-qsr-future-recommendations.md`
- `2026-05-institutional-grade-audit.md`
- `2026-05-nyc-singapore-viability-audit.md`
- `2026-05-revenue-growth-psychology-redesign.md`
