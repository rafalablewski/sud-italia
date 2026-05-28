# Admin — System

← back to [Admin README](../README.md)

The eight surfaces that manage admin itself: who can do what, what
regulations apply, what's been done, what's deployed, and the
chain-wide configuration.

| Page                              | Code                                                      | Role-gate |
| --------------------------------- | --------------------------------------------------------- | --------- |
| `/admin/users`                    | `src/components/admin/AdminUsers.tsx`                     | **owner**   |
| `/admin/compliance`               | `src/components/admin/AdminCompliance.tsx`                | manager+  |
| `/admin/regulatory-compliance`    | `src/app/admin/regulatory-compliance/page.tsx`            | **owner**   |
| `/admin/audit-log`                | `src/components/admin/AdminAuditLog.tsx`                  | manager+  |
| `/admin/capabilities`             | `src/app/admin/capabilities/page.tsx`                     | manager+  |
| `/admin/currency`                 | `src/components/admin/AdminCurrency.tsx`                  | **owner**   |
| `/admin/languages`                | `src/components/admin/AdminLanguages.tsx`                 | **owner**   |
| `/admin/settings`                 | `src/components/admin/AdminSettings.tsx`                  | **owner**   |

Owner-gating on Users / Currency / Languages / Settings is deliberate —
these change the *rules* admin runs under, not the *data* admin operates
on.

## Common rules across the section

1. **Capabilities is the source of truth for what's deployed**
   (CLAUDE rule 9). Every new admin page, integration, scheduled job,
   feature flag MUST register an entry in `/admin/capabilities` in the
   same commit it ships in. A feature not listed there is invisible to
   operators — treat the omission as a bug.
2. **The audit log captures every write that matters.** Settings
   changes, role changes, currency switches, language toggles, cash
   adjustments, customer-data edits — all land in the audit log with
   actor + before / after.
3. **System pages are slower-paced** — no toast-on-toggle here; changes
   to configuration usually open a confirmation dialog because they
   ripple across the chain.
4. **Owner override is the escape hatch, not the daily mode.** An owner
   *can* override a role gate or hard-bypass a permission, but each
   override lands in the audit log with a required reason.
5. **Compliance dates are first-class.** Every regulatory deadline /
   inspection / certification has a status (`upcoming` / `due` /
   `overdue` / `complete`) and a tone (`info` / `warning` / `danger` /
   `success`). Visible from the Dashboard widget too.

## Users & roles — `/admin/users`

The admin-account list — who has admin access, what role.

- **Header:** `Users & roles` (h1), search, role filter
  (`all` / `staff` / `kitchen` / `manager` / `owner`), `+ Invite user`
  primary.
- **Table:** email + name, role, last sign-in, two-factor status,
  status (`active` / `suspended`), row actions (change role, reset
  2FA, suspend, delete).
- **Role change** opens a portalled confirmation — "Promoting Maria to
  manager will grant access to X, Y, Z surfaces" — operator confirms
  the cascade.
- **The role enum is closed**: `staff` / `kitchen` / `manager` /
  `owner`. Don't add roles ad-hoc — every new role is a `nav.config.ts`
  + permission-matrix audit.
- **Distinguish admin user from staff** — `/admin/users` is for admin
  login accounts; `/admin/staff` is for the people who clock in. The
  same person can have both records (linked by email).

## Compliance calendar — `/admin/compliance`

The operational deadline tracker: HACCP refreshers, equipment
inspections, certification renewals, supplier audits.

- **Header:** `Compliance calendar` (h1), location switcher, status
  filter (`all` / `upcoming` / `due` / `overdue` / `complete`).
- **Table / timeline:** deadline name, category (HACCP / safety /
  certification / inspection / training), responsible role, next due
  date, status badge (`<Badge tone={status.tone} variant="soft" dot>`),
  attached document(s), `Mark complete` action.
- **Marking complete** asks for the completion date (defaults today)
  + optional document upload (inspection certificate / training
  attestation) + auto-schedules the next occurrence based on frequency.
- **Overdue items show on the Dashboard** as a warning widget — the
  operator can't miss them from the landing page.

## Regulatory disclosures — `/admin/regulatory-compliance`

The owner-only legal-text surface — privacy notice, terms, allergen
declaration, GDPR articles 13/14 disclosure templates.

- **Header:** `Regulatory disclosures` (h1).
- **Body:** sections for each disclosure type, each with the current
  published text, version history, the date of last legal review.
- **No casual editing.** Every change requires the owner role + a
  reason captured in the audit log. The customer-facing pages
  (`/privacy`, `/terms`) read straight from this surface.

## Audit log — `/admin/audit-log`

The append-only write trail.

- **Header:** `Audit log` (h1), date range, actor filter, action filter,
  free-text search.
- **Table:** when, actor (email + role), action (slug), entity
  (customer / order / staff / setting / etc.), entity ID, before
  snippet, after snippet, IP, optional reason.
- **No edit, no delete** — the audit log is append-only by design.
- **Export** as JSON or CSV for legal / accountant requests; the export
  itself is also logged.

## Capabilities — `/admin/capabilities`

The source-of-truth dashboard for what's deployed.

- **Header:** `Capabilities` (h1), category filter.
- **Body:** one card per feature / integration / scheduled job. Each
  card shows: `name`, one-sentence `summary` (what it does + how to
  use), `href` link to the primary admin / customer surface, required
  `envVars`, current `status` (`live` / `needs-config` / `disabled`)
  introspected at runtime from `process.env`.
- **Status auto-introspects** via the `has(...keys)` helper. A live
  feature with all env vars present is `live`; missing env vars give
  `needs-config`; an explicit kill switch gives `disabled`.
- **Anything not registered here doesn't exist** for the operator. This
  is the deal — if a feature ships without registering, operators can't
  find it, can't configure it, can't debug it.

## Currency — `/admin/currency`

The chain-wide currency configuration.

- **Header:** `Currency` (h1), `+ Add currency` for owner-grade.
- **Body:** list of supported display currencies (PLN canonical, EUR /
  USD / GBP toggleable for customer display); per-currency exchange
  rate source + refresh window; default fallback.
- **Books currency is always PLN.** Customer-facing display can be
  toggled; admin reports stay PLN (the `AdminCurrencyGuard` enforces
  this in the admin layout).
- **Future:** the toggle that hides currency UI from the storefront
  entirely (the "Layout" tab in Settings) reads from here.

## Languages — `/admin/languages`

The chain-wide language configuration — which locales the storefront
offers, the per-locale translation status.

- **Header:** `Languages` (h1).
- **Body:** locale list with: locale code, display name, status (active
  / draft / archived), translation coverage % (per surface: menu /
  checkout / loyalty / admin-comm), `+ Add language` primary for owner.
- **Source language is Polish** (the truck's home market); other locales
  are translations of the source.
- **Coverage < 100%** means the storefront falls back to source for
  missing strings — visible to the operator so they know what's
  showing English on a French-set browser.

## Settings — `/admin/settings`

The chain-wide configuration tabs.

- **Header:** `Settings` (h1).
- **Tabs:** General · **Layout** · **Themes** · Security · Audit ·
  Danger. Tab keys are stable for deep linking.
- **General:** chain identity (name, tagline, contact email), service
  defaults (default prep time, delivery radius), loyalty programme
  config, feature toggles.
- **Layout:** storefront visibility toggles. Each flips a flag in
  `AppSettings.layout` that the storefront reads via
  `/api/settings/public`; the owning component is wrapped in
  `<LayoutGate flag="…">` (`src/components/layout/LayoutGate.tsx`) and
  returns `null` when the flag is `false` — no DOM, no painted CSS, no
  event listeners. Toggle is the saved state (CLAUDE rule 7). 10
  surfaces today, grouped:
  - **Header** — currency switcher · language switcher
  - **Landing** — bundles showcase · loyalty pitch
  - **Menu pages** — seasonal specials rail
  - **Cart** — cross-sell rail · free-delivery progress
  - **Order confirmation** — push opt-in · feedback survey
  - **Site-wide** — chat widget
  Adding an 11th toggle is mechanical: add the key to `LayoutSettings`,
  add a `LAYOUT_TOGGLES` entry in `AdminSettings.tsx`, wrap the target
  with `<LayoutGate flag="…">` at the call site.
- **Security:** session lifetime, 2FA enforcement, password policy,
  IP allow-list.
- **Themes:** read-only inspector for the three-theme architecture
  (`src/components/admin/settings/ThemesTab.tsx`). Sub-tabs for
  Core / Admin / Homepage; each view shows the theme's source files +
  line counts, the routes that load it, live token swatches imported
  from the typed JS mirror (`themes/{core,homepage}/theme.ts` +
  `components/admin/v2/theme.ts`) so the colours always match what
  the code paints, the font stack and how it's loaded, the CSS
  selector prefixes the theme owns, and the file paths to edit. This
  is the surface where future write capabilities land (live token
  override, theme upload) but today it's strictly read-only — token
  edits go to the CSS files, UI edits to the components folders.
- **Audit:** the same audit log surfaced as a tab here for quick access
  alongside settings changes.
- **Danger:** seed development data (`DATABASE_URL` unset only), reset
  state, factory reset. Each requires typed confirmation.

## What System is not

- It is **not** application code — these pages configure rules that the
  app reads at runtime, but they're not where features are *built*.
- It is **not** customer-facing — the Settings General tab governs the
  storefront identity, but the storefront itself lives under Homepage.
- It is **not** operational state — System describes how admin works;
  Overview / Operations / Inventory describe the day's data.
- It is **not** the place to add new features — features live in their
  proper section; System just registers + governs them.

System is the **rules admin runs under** — who has access, what's
deployed, what's been done, what's regulated, and the chain-wide
config that every other section reads from.
