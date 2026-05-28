# docs

Internal design + audit documents. Code is the source of truth; these
exist to explain *why* decisions were made and *what* the next step is.

## Layout

```
docs/
├── README.md              ← you are here
├── design-system/         ← three independent themes — WordPress-style
│   ├── README.md          ← the three-theme model + "today vs target"
│   ├── core/              ← Core IP theme (POS, KDS, Guest)
│   │   ├── README.md
│   │   ├── theme/         ← Core-only tokens (backlog today)
│   │   ├── modules/       ← pos.md, kds.md, guest.md, crm.md, concierge.md, whatsapp.md
│   │   └── canonical-orders.md
│   ├── admin/             ← back-office theme (everything else under /admin/*)
│   │   ├── README.md      ← shell anatomy + per-section taxonomy
│   │   ├── theme/         ← admin-owned tokens, components, extend guide
│   │   └── mobile/        ← mobile shape of the admin
│   ├── homepage/          ← public storefront theme (/, /menu, /checkout, …)
│   │   ├── README.md
│   │   └── theme/         ← homepage-only tokens (backlog today)
│   └── backlog.md         ← cross-theme cleanup inventory
└── audits/                ← dated, scoped audits of specific surfaces
```

## `design-system/`

Three independent themes — no shared layer. Start at
[`design-system/README.md`](./design-system/README.md) for the doctrine
and the honest "today vs target" gap table. Each theme has the same
internal shape:

```
<theme>/
├── README.md       ← theme overview + the rules unique to this theme
├── theme/          ← color, typography, material, components (theme-owned)
└── <surfaces>/     ← per-page or per-module docs
```

The rule: **a token, font, component, or layout belongs to exactly one
theme.** Changes to one theme must not move the other two. The code
today only partially enforces this — see the design-system README for
the gap list and the code-split work that closes it.

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
