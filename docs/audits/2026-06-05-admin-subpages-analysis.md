# Admin Subpages — State of the World (analysis for the redesign)

> **Date:** 2026-06-05 · **Scope:** every `/admin/*` subpage — what it is, how it's
> built, and where it drifts from the standard. This is the *map we agreed to draw
> before redesigning*, so the redesign can make every page consistent,
> professional and standardised. Read top-to-bottom; the **Flaws** section is the
> punch-list.

---

## 1. How an admin page is built (the intended shape)

Every admin route follows the same two-file contract:

```
src/app/admin/<route>/page.tsx        ← thin SERVER component. Only job:
                                          isAuthenticated() → redirect or render.
src/components/admin/Admin<Thing>.tsx ← the "use client" component. All the UI.
```

`page.tsx` is boilerplate and identical everywhere:

```tsx
export default async function AdminUpsellPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminUpsell />;
}
```

The chrome around the page comes from the **v2 shell** (`AdminShell.tsx`),
mounted once in `src/app/admin/layout.tsx`:

- **Sidebar** (`v2/Sidebar.tsx`, `.app-sidebar`) — single source of nav, driven by
  `nav.config.ts`, role/permission-filtered, role-prefixed hrefs.
- **Topbar** (`v2/Topbar.tsx`) — breadcrumb (`Admin / <Page>`), search, help,
  theme toggle, notifications.
- **Command palette**, **notifications**, **shortcuts**, **toasts**, **location
  context** — all shell-level providers.

So a subpage component never renders nav or chrome. It renders **one `PageHero`
panel + a stack of `Card`s** inside `<div className="v2-page">`.

### The canonical page skeleton

```tsx
<div className="v2-page">
  <PageHero
    title="…"
    subtitle="one line: what this page is"
    location={{ value, onChange }}      // optional — pill LocationFilter
    actions={<Button … />}              // optional — ICON-ONLY (New / Save / Export)
    filter={{ value, onChange, options }} // optional — pill Tabs (short list filter)
    dropdowns={[…]}                     // optional — Select (verbose filters)
    nav={{ value, onChange, options }}  // optional — underline Tabs (sub-views)
  />
  {/* sub-view bodies, each a stack of <Card> */}
</div>
```

`PageHero` (`v2/ui/PageHero.tsx`) is **data-driven and enforced**: each slot takes
DATA, not JSX, and renders the *one* canonical widget — location is always the
pill `LocationFilter`, the primary filter is always a pill `Tabs`, verbose filters
are always `Select`s, sub-view nav is always an underline `Tabs`. A page *cannot*
substitute a different widget, which is the whole point — the controls can't
drift. The screenshot the redesign started from (Upsell: title → subtitle + save →
Kraków/Warszawa → Bundles/Item modifiers) is exactly these rows stacked.

- **Golden reference page:** `AdminPurchaseOrders.tsx`.
- **Header anatomy + rules:** `docs/design-system/admin/theme/components.md` →
  "Page hero & section eyebrows".
- **`actions` are icon-only** with `aria-label` + `title` (the dropped text), all
  normalised to one 34px size by CSS. One **primary** button per view.

### Shared building blocks (all in `src/components/admin/v2/ui/`)

`Button` · `Card` · `Badge` · `Chip` · `Table` · `Tabs` · `Select` · `Input` ·
`Switch` · `Dialog`/`ConfirmDialog` · `Popover` · `Tooltip` · `Toast` ·
`InfoButton` · `LocationFilter` · `DatePager` · `EmptyState` · `PageHero`.
Plus `Explainers.tsx` (`MetricExplainer` / `PageExplainer` — the 5-section ⓘ
contract, Rule #12).

---

## 2. Full inventory — every admin subpage

Grouped by sidebar section (`nav.config.ts`). **LOC** = component line count
(rough proxy for surface complexity). **Sub-views** = the underline-`Tabs` the
page splits itself into.

### Overview
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin` | `AdminDashboard` | 947 | Executive overview — KPI bands (Headline / Operations & risk / Performance / Demand / Network) | — |
| `/admin/orders` | `AdminOrders` | 1278 | Every order from payment → fulfillment | Kanban · Table |

### Core (proprietary OS — served under `/core/*`, old `/admin/*` routes redirect)
| Route | Redirects to | Component | LOC | What it is |
|---|---|---|---|---|
| `/admin/floor` | `/core/service?view=floor` | `AdminPos`-family | — | Live room + table assignment |
| `/admin/slots` | `/core/service?view=slots` | — | — | Capacity + demand |
| `/admin/crm` | `/core/guest?view=guests` | `AdminCrm` | 1251 | Customer book |
| `/admin/loyalty` | `/core/guest?view=loyalty` | `AdminLoyalty` | 1120 | Tiers / rewards / referrals / live widgets |
| `/admin/concierge` | `/core/guest?view=concierge` | `AdminConcierge` | 380 | AI concierge layer |
| `/admin/whatsapp` | `/core/guest?view=inbox` | `AdminWhatsApp` | 1178 | WhatsApp inbox |

> These six are **redirect stubs** now — the real surfaces moved into the unified
> Core suite (POS / KDS / Guest Engagement / Service). They are the reason 10
> `Admin*.tsx` components don't import `PageHero`: they live under the Core shell,
> not the admin hero contract.

### Operations
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin/menu` | `AdminMenu` | 2111 | Per-location menu management + overrides | — |
| `/admin/menu/[baseSlug]` | `AdminMenuDetail` | 1034 | Single-dish editor (price/cost/dietary/allergens) | — |
| `/admin/recipes` | `AdminRecipes` | 2354 | Chain-wide recipes + ingredient catalog (one card per dish, no location switch — Rule #10) | Recipes · Ingredients |
| `/admin/haccp` | `AdminHaccp` | 254 | Cold/hot-holding checks per shift, audit-logged | — |
| `/admin/waste` | `AdminWaste` | 292 | Reason-coded write-off log → daily cost | — |
| `/admin/handover` | `AdminHandover` | 322 | End-of-shift sign-off (drawer/temps/waste/note) | — |

### Inventory
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/inventory` | `AdminInventory` | 880 | On-hand stock per location · low-stock alerts · receive/waste/consume log |
| `/admin/suppliers` | `AdminSuppliers` | 291 | Vendor directory feeding POs |
| `/admin/purchase-orders` | `AdminPurchaseOrders` | 594 | Raise POs; receive auto-credits stock — **golden reference for the hero** |

### People
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/staff` | `AdminStaff` | 660 | Hire team, per-person logins, roster, rates, clock-in/out, 7-day labor cost |
| `/admin/schedule` | `AdminSchedule` | 438 | Weekly grid, cost rolls up from real hourly rates |

### Customers
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin/customers` | `AdminCustomers` | 314 | Everyone who paid, ranked by LTV, RFM status | — |
| `/admin/customers/[phone]` | `AdminCustomerDetail` | 640 | Single-customer profile + notes | — |
| `/admin/corporate` | `AdminCorporate` | 488 | Corporate / B2B accounts | — |
| `/admin/feedback` | `AdminFeedback` | 505 | Per-order ratings + comments (call back negatives) | — |
| `/admin/surveys` | `AdminSurveys` | 527 | NPS micro-surveys across the storefront | — |

### Finance
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/reports` | `AdminReports` | 507 | Comp sales + YoY story |
| `/admin/cash` | `AdminCash` | 664 | Cash sessions / drawer reconciliation |
| `/admin/business-costs` | `AdminBusinessCosts` | 868 | Operating expense ledger (payroll/rent/utilities/fuel…) |
| `/admin/simulation` | `AdminSimulation` | **17,236** | "Calculator" — 12-month forecast, break-even, sensitivity, fleet model (feature-flagged) |

### Growth
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin/growth` | `AdminGrowth` | 864 | Campaigns + loyalty config | Rewards · Tiers · Referrals · Live widgets |
| `/admin/upsell` | `AdminUpsell` | 200 | Bundle ladders + gating | Bundles · Item modifiers |
| `/admin/crosssell` | `AdminCrossSell` | 260 | Cart pairings / combos / time-of-day / badges | Cart pairings · Combo deals · Time-of-day · Menu badges |
| `/admin/scheduled-bundles` | `AdminScheduledBundles` | 253 | Time-windowed bundle scheduling | — |
| `/admin/truck` | `AdminTruck` | 666 | Route + event planning | Events · Routes |

> Upsell / Cross-sell / Scheduled-bundles share state via `AdminSellingShared.tsx`
> (1,780 LOC). This **whole family** is the main legacy island — see Flaws.

### Intelligence
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/locations` | `AdminLocations` | 392 | Side-by-side location benchmark |
| `/admin/locations/manage` | `AdminLocationsManager` | 584 | Add/edit locations + readiness checklist |
| `/admin/reports/cohort` | `AdminCohortReport` | 513 | Cohort retention / CLTV |
| `/admin/reports/ltv-cac` | `AdminLtvCac` | 498 | LTV / CAC economics |
| `/admin/menu-engineering` | `AdminMenuEngineering` | 648 | Kasavana-Smith quadrants over real line items |
| `/admin/ai` | `AdminAI` | 668 | Heuristic insights | Forecast · Anomalies · Reorder · Staffing · Chatbot FAQ |
| `/admin/expansion` | `AdminExpansion` | 470 | New-unit / franchise modelling |

### System
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin/users` | `AdminUsers` | 1452 | Users & roles | — |
| `/admin/permissions` | `AdminPermissions` | 478 | Granular permission matrix | — |
| `/admin/compliance` | `AdminCompliance` | 393 | Compliance calendar (permits/inspections/insurance) | — |
| `/admin/regulatory-compliance` | `AdminRegulatoryCompliance` | 506 | Regulatory disclosures + JPK_V7M export | — |
| `/admin/soc2` | `AdminSoc2` | 125 | SOC 2 controls | — |
| `/admin/audit-log` | `AuditLog` | 354 | Immutable change trail | — |
| `/admin/capabilities` | (server page) | — | Deployed-feature ledger (Rule #9 source of truth) | — |
| `/admin/currency` | `AdminCurrency` | 278 | Customer-facing currency switcher config | — |
| `/admin/languages` | `AdminLanguages` | 223 | Customer-facing language switcher config | — |
| `/admin/settings` | `AdminSettings` | 1317 | Account/business config | General · Layout · Themes · Security · Audit log · Advanced |

**Totals:** ~46 live admin routes + 6 Core redirect stubs. ~53 `Admin*.tsx`
components, **~53,000 LOC** combined (with `AdminSimulation` alone at 17k).

---

## 3. Flaws & inconsistencies (the redesign punch-list)

What's actually inconsistent today, with evidence:

### 🔴 F1 — The Growth "selling" family never migrated off legacy `glass-card`
The rest of the admin moved to the `<Card>` primitive; this family still uses the
raw `glass-card` class:

| File | `<Card>` | `glass-card` |
|---|---|---|
| `AdminUpsell` | 0 | **5** |
| `AdminCrossSell` | 0 | **11** |
| `AdminScheduledBundles` | 0 | **3** |
| `AdminCorporate` | 0 | **3** |
| `AdminSellingShared` | 0 | **7** |

Everywhere else: `AdminDashboard` 17, `AdminReports` 18, `AdminSettings` 30,
`AdminAI` 18, `AdminSimulation` 88 — all `<Card>`, zero `glass-card`. **This is
the page in the screenshot.** It looks "off" because it's the last legacy island.
→ *Migrate the whole selling family (incl. `AdminSellingShared`) to `<Card>`.*

### 🔴 F2 — Raw inline hex instead of tokens (Rule: "all colour from tokens")
~36 hardcoded hex literals across components — chart/status colours that should be
design tokens:

```
6× #ef4444   5× #f59e0b   4× #38bdf8   4× #34d399   4× #10b981
2× #dc2626   2× #94a3b8   2× #28a06d   2× #15171c   1× #ec4899
```

The sanctioned exception is the four `Explainers` accent rails — everything else
should resolve from `--danger` / `--warning` / `--info` / `--success` etc.
→ *Sweep these into tokens (or chart-token vars).*

### 🟠 F3 — Save-action pattern only half-adopted
The icon-only `PageHero` save button with `saved/saving` state
(`leadingIcon={saved ? <Check/> : <Save/>}`) lives in only **2** files
(`AdminUpsell`, `AdminCrossSell`). Other editor pages (`AdminSettings`,
`AdminGrowth`, `AdminLanguages`, `AdminCurrency`, `AdminBusinessCosts`…) each
express "save" / "dirty" / "saved" differently.
→ *Extract one `SaveAction` (or a `useSaveState` hook) and use it in every editor
hero. Note Rule #7: toggles must save immediately with no button at all.*

### 🟠 F4 — Loading-pill copy is hand-written per page
Every page early-returns its own string: `Loading Business costs…`, `Loading
Cross-sell…`, … and **3 pages still say bare `Loading…`**. One-offs are
error-prone (mobile-pill trap, Rule #4 / components.md "Loading states").
→ *A `<PageLoading label="…" />` wrapper that guarantees the `.v2-page` wrap and
consistent copy.*

### 🟠 F5 — `glass-input` still pervasive (38 uses)
`glass-input` is the legacy alias of `v2-input`. It works, but it's a second name
for the same control, concentrated in the same legacy files — a consistency smell
that hides which pages were actually modernised.
→ *Normalise on the `Input`/`Select` primitives (or settle on one class name).*

### 🟡 F6 — `AdminSimulation` is a 17k-LOC monolith
The Calculator is **3× larger than the next biggest file** and 32% of all admin
component code. It's feature-flagged, but its size makes it un-reviewable and a
likely home for drift (it has its own `HELP` registry, its own card patterns).
→ *Not a visual flaw, but flag for decomposition before it diverges further.*

### 🟡 F7 — Error/empty states are bespoke per page
`AdminUpsell`'s load-error is a hand-built `glass-card` block; others use
`EmptyState`; some use a `Card`. The five-section `MetricExplainer` is enforced,
but **error/empty/loading** are not.
→ *Standardise on `EmptyState` + a shared error card.*

### 🟡 F8 — Sub-view (`nav`) tab grammar varies
Tab labels mix verbs and nouns and granularity: Orders (`Kanban`/`Table` = view
mode) vs Settings (6 domain sections) vs AI (5 analysis types) vs Recipes
(`Recipes`/`Ingredients`). All technically use the underline `Tabs`, but there's
no rule for *when a page earns sub-views vs. just stacking cards*.
→ *Define the rule (≥2 genuinely separate workspaces → `nav`; otherwise stack).* 

### ✅ What's already consistent (don't break it)
- `PageHero` adoption: **43/43** real admin pages use it (the 10 non-users are
  Core redirects + non-page helpers).
- `<Card>` primitive: adopted by ~38 of 43 (only the F1 family lags).
- Sidebar/topbar/command-palette/shortcuts: single shell, pixel-identical.
- Portal discipline (Rule #4), `MetricExplainer` 5-section contract (Rule #12),
  `Switch`-not-checkbox (Rule #7), `LocationFilter` as the only per-page site
  filter — all enforced and largely honoured.

---

## 4. Recommended redesign order

1. **F1** — migrate the Growth/selling family to `<Card>` (fixes the screenshot).
2. **F2** — token-sweep the inline hex.
3. **F3 + F4 + F7** — ship shared `SaveAction`, `PageLoading`, and error/empty
   wrappers, then adopt across every editor page in one pass.
4. **F5** — retire `glass-input`/`glass-card` aliases once F1 lands (grep → zero).
5. **F8** — write the "when does a page get sub-views" rule into
   `docs/design-system/admin/theme/components.md`.
6. **F6** — schedule `AdminSimulation` decomposition separately.

Every code change above must land with its matching
`docs/design-system/admin/**` doc edit in the same commit (Rule #11), and any new
shared primitive gets a `/admin/capabilities` entry if it's operator-visible
(Rule #9).

---

*Generated as a pre-redesign snapshot. Audits under `docs/audits/` are historical
and never edited retroactively (Rule #11).*
