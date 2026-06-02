# Admin — System

← back to [Admin README](../README.md)

The surfaces that manage admin itself: who can do what, what
regulations apply, what's been done, what's deployed, and the
chain-wide configuration.

| Page                              | Code                                                      | Role-gate |
| --------------------------------- | --------------------------------------------------------- | --------- |
| `/admin/users`                    | `src/components/admin/AdminUsers.tsx`                     | **owner**   |
| `/admin/permissions`              | `src/components/admin/AdminPermissions.tsx`               | **owner**   |
| `/admin/compliance`               | `src/components/admin/AdminCompliance.tsx`                | manager+  |
| `/admin/regulatory-compliance`    | `src/app/admin/regulatory-compliance/page.tsx`            | **owner**   |
| `/admin/soc2`                     | `src/components/admin/AdminSoc2.tsx`                      | **owner**   |
| `/admin/audit-log`                | `src/components/admin/AuditLog.tsx`                  | manager+  |
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

The admin-account list — who has admin access, what role, and the
**granular, action-level permissions** that govern what each account can
actually reach.

- **Header:** `Users & roles` (h1), search, role filter
  (`all` / `owner` / `manager` / `staff` / `kitchen`), `New user`
  primary.
- **Table:** name + email, role, **Access** (`Full access` for owners,
  `Custom · N` when the account carries a custom grant, else
  `Role default`), **Locations** (one badge per assigned site, or `All` when
  unscoped — a manager can run several), **Sign-in** (`Password` / `No password`
  + a `PIN` chip when one is set + an `N keys` chip when passkeys are
  registered; owners read `Shared / own`), status (`active` / `disabled`),
  `MFA` (On / Off), row actions (`Login`, `MFA`, `Keys`, `Edit`, delete). Live
  code: `AdminUsers.tsx`.
- **Login & credentials (owner-only):** the `Login` row action (shown to
  owners, for non-owner accounts) opens `CredentialsDialog` — set / clear a
  per-user **password** (min 8) and a terminal **PIN** (4–10 digits, unique
  per location). Posts to `POST /api/admin/users/[id]/credentials`
  (owner-only, audited `users.credentials_set`). Once a personal password is
  set, that account's `/admin/login` verifies against its own scrypt hash and
  no longer accepts the shared `ADMIN_PASSWORD`. Secrets never leave the
  server — the users API strips `passwordHash` / `pinHash` / `totpSecret` from
  reads and exposes only `hasPassword` / `hasPin` / `totpEnabled` booleans.
- **MFA (TOTP):** the `MFA` row action opens an enrollment dialog —
  Begin setup → add the shown secret to an authenticator app → confirm
  a 6-digit code to turn it on (or disable, with a current code; an
  owner can force-disable for recovery). Once enabled, `/admin/login`
  requires the code in addition to the password. Per-user enroll
  is self-service only; the shared owner session is covered by
  `ADMIN_TOTP_SECRET` instead. Secrets never leave the server — the
  users API strips `totpSecret` from reads. Code:
  `src/app/api/admin/users/[id]/mfa/route.ts`,
  `src/app/admin/login/page.tsx`, `src/lib/totp.ts`.
- **Passkeys / security keys (WebAuthn):** the `Keys` row action opens
  `PasskeyDialog` — the account holder (self-only enroll, like MFA) registers
  a hardware key (YubiKey) or device passkey (Touch ID / Windows Hello) with
  `@simplewebauthn/browser`; the list shows each key with a remove action (an
  owner can remove a lost key for recovery). At `/admin/login` the holder
  enters their email and taps the key — passwordless, phishing-resistant.
  Server: enrollment `POST /api/admin/users/[id]/webauthn`
  (`register-begin` / `register-finish` / `delete`), login
  `POST /api/admin/webauthn/authenticate` (`begin` / `finish`). RP id + origin
  derive from the request host (`src/lib/webauthn.ts`), overridable with
  `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN`. Public keys + counters never ship to
  the client — the users API exposes only a sanitized `webauthnKeys` list
  (id, name, createdAt, transports). The enrollment challenge sits on the user
  row; the login challenge rides a short-lived signed cookie (no session yet).
- **Edit** opens an `lg` dialog (name, email, role, status, location
  scope, notes, **permissions**); save preserves the user's MFA fields
  rather than wiping them.
- **Multi-location scope.** An account can be scoped to **several** locations
  (a manager can run more than one site) via a `Chip` multi-select — none
  selected = all locations. The canonical field is `AdminUser.locationSlugs`
  (array); the legacy single `locationSlug` still resolves through
  `userLocationSlugs()` (`src/lib/user-locations.ts`). At login the set is
  bound into the session as the comma-separated `locationScope` and enforced by
  `requireLocationAccess` on every admin route (owners stay unrestricted, `*`).
  Owners can&rsquo;t be scoped. Terminal-PIN resolution honours the full set, so
  a multi-site manager&rsquo;s PIN works at any of their terminals.
- **The role enum is closed**: `staff` / `kitchen` / `manager` /
  `owner` (`franchisee` exists in the rank table but isn't offered in
  the upsert form). Don't add roles ad-hoc — every new role is a
  `nav.config.ts` + permission-catalog audit.
- **Distinguish admin user from staff** — `/admin/users` is for admin
  login accounts; `/admin/staff` is for the people who clock in. The same
  person can have both records: when a manager hires with login access the
  staff route provisions the `AdminUser` and links the two
  (`AdminUser.staffId` ↔ `StaffMember.userId`, the former authoritative). The
  owner creates manager/owner accounts here; managers create staff/kitchen
  logins through the hire flow (`staff.hire`) — never here.
- **Login surfaces + role routing.** Three doors mint the *same* signed,
  location-scoped session: `/admin/login` (email + per-user password with
  optional TOTP, **or** a passwordless passkey / security key), and
  `/terminal` (numeric PIN on a shared kitchen/POS device →
  `POST /api/terminal/login`, location-scoped + 5/min/IP limited). All route
  by role via `landingPathForRole` (`src/lib/staff-roles.ts`): `kitchen` →
  `/admin/kds`, `staff` → `/admin/pos`, manager/owner/franchisee → `/admin`.
  Each login API returns the `landing` path so the page redirect has one
  source of truth.

### Granular permissions (action-level RBAC)

The unit of authority is a **permission**, not a role. The catalog —
**71 action-level keys** grouped by domain (orders, guests, menu,
inventory, people, finance, growth, intelligence, system) — lives in
`src/lib/permissions.ts` and is the **single source of truth that gates
both the UI and the API**. Never hard-code a permission string at a call
site; add/extend a key in the catalog so a typo fails to compile.

- **Editor** (`PermissionEditor` inside `AdminUsers.tsx`): a `Customize`
  `Switch` per non-owner account. Off = the account **inherits its
  role's default preset** (`ROLE_DEFAULT_PERMISSIONS`, shown as
  `Role default`); on = a **fully-custom grant** — one `Switch` per
  capability, grouped into cards with an `All`/`None` toggle and an
  `N/total` count per group, plus `Reset to <Role> defaults`. Owners
  show a locked note — they're always all-access and never carry a
  stored grant.
- **Only an owner can grant** (the "only admin can grant" rule).
  Managing admin accounts *is* the act of granting authority — role,
  location scope, permissions — so every write on `/api/admin/users`
  (POST / PUT / DELETE) is **owner-only**: `roles: ["owner"]` stops a
  role-default manager at `withAdmin`, and an explicit `ownerOnly(user)`
  check additionally blocks a custom-grant user who was handed
  `users.edit` (for custom users permissions override role rank, so the
  role gate alone wouldn't catch them). Reads (GET) stay any-auth so the
  page can list the roster. The `users.*` catalog keys exist for the path
  map but are effectively owner-only in practice.
- **Persistence:** the dialog sends `permissions` as an **array** (custom
  grant), `null` (clear → fall back to role defaults), or omits it (leave
  untouched) — mirroring the `totpSecret` set/clear/preserve pattern in
  `saveAdminUser`. Stored on `AdminUser.permissions`; validated by
  `adminUserUpsertSchema` (every entry must be a known key). Writes are
  audited as `users.create` / `users.update`.
- **Resolution** (`resolveEffectivePermissions`): owner / the legacy
  shared `admin` session → `all` (god-mode, the lockout escape hatch); an
  account with an array → `custom` (authoritative, **overrides role
  rank**); everyone else → role-default preset. This is why the upgrade
  is a no-op for existing accounts — no `permissions` field means
  "behave exactly as before".
- **Enforcement is end-to-end** (both UI + server, per the build spec):
  - **Sidebar** — `filterNavForPermissions` (replaces the role-only
    `filterNavForRole` in `useNavSections`) hides any nav item whose page
    maps to a permission the user lacks. Mapping: `permissionForAdminPage`.
  - **Page guard** — `AdminShell` resolves the session's permissions once
    and `router.replace("/admin")` on direct navigation (typed URL /
    stale bookmark) to a forbidden page. Cosmetic safety net only.
  - **Server (the real boundary)** — `withAdmin` resolves the caller's
    effective permissions and, for a **custom** user, requires the
    permission that `permissionForApiPath(path, method)` infers for the
    route (unmapped routes fall back to the declared role gate, never
    wide open). Role-default users keep the legacy role-rank gate; owners
    bypass both. GET→`.view`, mutating verbs→`.edit`/action keys
    (`orders.refund`, `purchase_orders.approve`, `cash.manage`, …).
  - `/api/admin/me` returns `{ allAccess, custom, permissions }` so the
    client gates on the exact set the server enforces (and keeps the
    legacy role-rank nav/guard for role-default users).
  - **Defence in depth** — high-value handlers re-assert the *specific*
    capability at the call site via `userHasPermission(user, key)` (which
    reads the `withAdmin` auth context, no extra DB hit), on top of
    `withAdmin`'s path-map inference: refunds (`orders.refund`), cash
    open/close/drop/hide/delete (`cash.manage`), GDPR export
    (`customers.export`), loyalty point adjustments
    (`guest.loyalty_adjust`), purchase-order writes
    (`purchase_orders.edit`), settings writes (`settings.edit`).
    Irreversible GDPR erasure is deliberately **not** mapped to a
    mid-tier key (`permissionForApiPath` returns `null` for it) so it
    falls back to its owner-only role gate.
- **Adding a capability:** add the key to the right group in
  `PERMISSION_GROUPS`, slot it into the relevant `ROLE_DEFAULT_PERMISSIONS`
  preset(s), and extend `permissionForAdminPage` / `permissionForApiPath`
  if it introduces a new page or route segment. The editor, nav filter,
  page guard, and API gate all pick it up automatically.

## Permission matrix — `/admin/permissions`

The **live** cross-tab of capabilities × access — a visualization (and control
surface) over the same RBAC model the rest of the section configures. Owner-only.

- **Nothing is hand-maintained.** Rows come from `PERMISSION_GROUPS`
  (`src/lib/permissions.ts`), the columns and cells from the role presets
  (`ROLE_DEFAULT_PERMISSIONS`) and the live `/api/admin/users` list resolved
  through `resolveEffectivePermissions`. Add a capability key or a user and it
  appears here automatically — never add a row/column by hand.
- **KPI row:** capability count, role count, user-account count, custom-grant
  count (`KpiCard`, no ⓘ — plain metrics).
- **Two views** (`Tabs`): **By role** (columns = `owner` / `franchisee` /
  `manager` / `staff` / `kitchen`, cells = the role's *default* grant, owner =
  all; read-only, since presets are code) and **By user** (columns = real
  accounts sorted owners → rank → name, cells = each account's *effective*
  access with a `custom` / count hint in the header).
- **Editable cells (By user, owner-only):** clicking a cell grants/revokes that
  capability for that account. It resolves the user's current effective set,
  flips the one key, and `PUT`s a fully-custom `permissions` array to the
  owner-only `/api/admin/users` (the account stops inheriting role defaults).
  Optimistic update, then the matrix re-reads so it always reflects server
  truth; owner columns are locked (always all-access).
- **Search + group filter** (`Chip` row) narrow the rows; a sticky first column
  + header keep orientation while scrolling a wide user grid. Green check =
  granted, muted dash = not. Code: `AdminPermissions.tsx`.

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

## SOC 2 controls — `/admin/soc2`

Owner-only security-readiness board. Maps the platform's **live runtime
posture** to the SOC 2 Trust Services Criteria — readiness, not
certification.

- **Introspected, never static:** the server page gathers real signals
  (env config, the admin-user table, the audit log) and the pure
  `src/lib/soc2.ts` `buildSoc2Register` engine maps them to controls
  (CC6.1/6.2/6.3 access, CC6.6 transit encryption, CC6.7 payment
  tokenization, CC7.1 job auth, CC7.2 monitoring, CC8.1 change mgmt,
  A1.2 availability, C1.1 secrets). Same `has(...env)` philosophy as the
  Capabilities ledger.
- **KPI row** (`v2-kpi-grid` + `KpiCard`): readiness score (met = 1,
  partial = 0.5, gap = 0 → %), Met / Partial / Gaps counts.
- **Per-category cards** (Security / Confidentiality / Availability /
  Processing Integrity): each control row shows a status `Badge`
  (success/warning/danger = met/partial/gap), the TSC id + criterion,
  the **evidence** observed, and **remediation** when not met.
- **Gating:** owner-only at the page level (redirects non-owners) — it
  exposes the whole platform's security posture.

## Regulatory disclosures — `/admin/regulatory-compliance`

The owner-only per-location regulatory pack — every truck is tagged
with the zone it operates under (EU / NYC / SG) and the
zone-specific disclosure fields. Live code:
`src/components/admin/AdminRegulatoryCompliance.tsx`.

- **Header:** `Regulatory disclosures` (h1) + the default-zone
  selector.
- **Per-location switcher:** pill-row of every active truck (reads
  from `@/data/locations`); the panel below renders the fields for
  the truck's zone.
- **Zone panels:**
  - **EU / Poland** — VAT rate input (basis points, default 800 = 8 %,
    drives every JPK_V7M row via `resolveLocationCompliance().vatRateBps`
    so a truck on a different rate doesn't need a deploy); optional
    UK-style voluntary kcal disclosure toggle.
  - **NYC** — DOH letter grade + issued date, §81.50 calorie disclosure
    toggle, FRESH Act packaging text.
  - **SG** — MUIS Halal cert + expiry, NEA Nutri-Grade toggle, IRAS GST
    (registered + number + rate in bps, default 900 = 9 %), PDPA §13
    consent body.
- **Persistence:** `PUT /api/admin/regulatory-compliance` (owner only),
  schema-validated with Zod. The "skip locations with no overrides"
  rule keeps the persisted blob lean — a location at the default zone
  with no extra fields set is omitted from `byLocation` on save.
- **Customer surfaces consume this:** NYC DOH banner, per-item kcal
  pill, SG Nutri-Grade hex + halal chip + GST line + PDPA consent
  dialog. JPK_V7M reads the EU VAT rate per row. All served via
  `/api/settings/public?location=` so SSR + hydration agree.
- **Audit trail.** Every save lands in the audit log as
  `settings.compliance.update` with before/after snapshots.

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
- **Optional `setup` guide:** a card may carry a `setup: SetupGuide`
  (`{ goal, steps: { text, code? }[], appliesAt?, doc? }`). It renders as
  an expandable `<details>` block **outside** the card's wrapping `<Link>`
  (a `<details>` is interactive content and can't nest in an anchor, and
  the toggle must not navigate). Use it on `needs-config` items to turn
  "Set: FOO" into an actual how-to — copyable commands, where to paste the
  value (`appliesAt`), and a pointer to the in-repo runbook (`doc`). Live
  examples: admin password rotation, MFA, Sentry alerting, S3 backup.
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
- **General:** chain identity (name, tagline), service defaults
  (delivery fee, minimum order, per-segment free-delivery
  thresholds), **Refund & comp controls** (`AppSettings.refundControls`
  — per-refund ceiling + per-actor-per-location daily comp cap, audit
  §11.2; always sent as a complete object so a partial PUT can't drop a
  field on the shallow merge; enforced server-side in the refund route),
  **Business contact** (operator-managed `businessPhone` +
  `businessEmail`), **Social links** (Instagram / Facebook / TikTok
  URLs). The contact + social fields propagate to the public footer
  through `getSettings()` (Footer is an async server component) — empty
  fields hide the matching row / link instead of shipping placeholder
  strings.
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
