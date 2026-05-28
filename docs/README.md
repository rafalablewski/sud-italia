# docs

Internal design + audit documents. Code is the source of truth; these
exist to explain *why* decisions were made and *what* the next step is.

## Layout

```
docs/
├── README.md            ← you are here
├── design-system/       ← the visual + interaction language
│   ├── foundations/     ← shared tokens: philosophy, color, type, material
│   ├── modules/         ← Core (the IP): POS, KDS, CRM, Concierge, WhatsApp
│   ├── admin/           ← back-office around the Core modules
│   ├── mobile/          ← mobile shape of the admin
│   ├── web/             ← public storefront (placeholder)
│   ├── tablet/          ← tablet patterns (placeholder)
│   ├── components.md    ← cross-surface primitives
│   ├── canonical-orders.md
│   ├── backlog.md
│   └── extend.md
└── audits/              ← dated, scoped audits of specific surfaces
```

## `design-system/`

The shared design language. Start at
[`design-system/README.md`](./design-system/README.md). The folder is
organised around the **inheritance chain**:

- **Foundations** are the shared visual language — every surface inherits,
  none of them fork.
- **Core modules** (POS, KDS, CRM, Concierge, WhatsApp) are the productised
  IP and own per-module rules.
- **Admin, mobile, web, tablet** are the surfaces the Core modules and the
  back-office render into. Each documents its own layout / navigation /
  ergonomics, on top of foundations.

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
