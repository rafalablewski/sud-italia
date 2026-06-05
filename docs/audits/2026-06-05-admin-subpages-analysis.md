# Admin Subpages — State of the World (analysis for the redesign)

> **Date:** 2026-06-05 · **Scope:** the `/admin/*` back-office subpages — what each
> one is, how it's built, and where it drifts from a consistent, professional,
> standardised look. **`/core/*` is explicitly OUT OF SCOPE** (POS, KDS, Guest
> Engagement, Service are a separate suite with their own shell; the old
> `/admin/floor|slots|crm|loyalty|concierge|whatsapp` routes are just redirect
> stubs into it and are ignored here).
>
> This is the map we agreed to draw before redesigning. **Section 3 is the real
> brief: the controls — buttons, location filter, tabs — and the overall dated
> look are the #1 problem.** The inventory (Section 2) is the supporting catalog.

---

## 1. How an admin page is built (the intended shape)

Every admin route is a two-file contract:

```
src/app/admin/<route>/page.tsx        ← thin SERVER component. Only job:
                                          isAuthenticated() → redirect or render.
src/components/admin/Admin<Thing>.tsx ← the "use client" component. All the UI.
```

The chrome (sidebar, topbar, command palette, notifications) is mounted once by
the **v2 shell** (`AdminShell.tsx` in `src/app/admin/layout.tsx`). A subpage never
renders nav — it renders **one `PageHero` panel + a stack of `Card`s** inside
`<div className="v2-page">`:

```tsx
<div className="v2-page">
  <PageHero
    title="…" subtitle="what this page is"
    location={{ value, onChange }}        // pill LocationFilter
    actions={<Button … />}                // icon-only (New / Save / Export)
    filter={{ value, onChange, options }} // pill Tabs
    nav={{ value, onChange, options }}    // underline Tabs (sub-views)
  />
  {/* sub-view bodies, each a stack of <Card> */}
</div>
```

`PageHero` is **data-driven and enforced** (each slot takes data, renders one
canonical widget). Golden reference: `AdminPurchaseOrders`. **The good news: the
structure is already consistent** — every real admin page uses `PageHero`, so
title/subtitle/location/filter/nav sit in the same place everywhere. **The
problem is what those slots render and how it looks** — see Section 3.

Shared primitives live in `src/components/admin/v2/ui/`: `Button`, `Card`,
`Badge`, `Chip`, `Table`, `Tabs`, `Select`, `Input`, `Switch`, `Dialog`,
`LocationFilter`, `PageHero`, `EmptyState`, `InfoButton`, etc.

---

## 2. Inventory — every in-scope admin subpage

Grouped by sidebar section (`nav.config.ts`). **LOC** = component line count.
**Sub-views** = the underline-`Tabs` the page splits into.

### Overview
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin` | `AdminDashboard` | 947 | Executive overview — KPI bands | — |
| `/admin/orders` | `AdminOrders` | 1278 | Every order, payment → fulfillment | Kanban · Table |

### Operations
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin/menu` | `AdminMenu` | 2111 | Per-location menu management + overrides | — |
| `/admin/menu/[baseSlug]` | `AdminMenuDetail` | 1034 | Single-dish editor | — |
| `/admin/recipes` | `AdminRecipes` | 2354 | Chain-wide recipes + ingredients (Rule #10) | Recipes · Ingredients |
| `/admin/haccp` | `AdminHaccp` | 254 | Cold/hot-holding checks per shift | — |
| `/admin/waste` | `AdminWaste` | 292 | Reason-coded write-off log → daily cost | — |
| `/admin/handover` | `AdminHandover` | 322 | End-of-shift sign-off | — |

### Inventory
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/inventory` | `AdminInventory` | 880 | Stock per location · low-stock · receive/waste/consume |
| `/admin/suppliers` | `AdminSuppliers` | 291 | Vendor directory feeding POs |
| `/admin/purchase-orders` | `AdminPurchaseOrders` | 594 | Raise/receive POs — **golden hero reference** |

### People
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/staff` | `AdminStaff` | 660 | Hire team, logins, roster, rates, clock-in/out |
| `/admin/schedule` | `AdminSchedule` | 438 | Weekly grid, cost from real hourly rates |

### Customers
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/customers` | `AdminCustomers` | 314 | Everyone who paid, ranked by LTV, RFM |
| `/admin/customers/[phone]` | `AdminCustomerDetail` | 640 | Single-customer profile + notes |
| `/admin/corporate` | `AdminCorporate` | 488 | Corporate / B2B accounts |
| `/admin/feedback` | `AdminFeedback` | 505 | Per-order ratings + comments |
| `/admin/surveys` | `AdminSurveys` | 527 | NPS micro-surveys |

### Finance
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/reports` | `AdminReports` | 507 | Comp sales + YoY |
| `/admin/cash` | `AdminCash` | 664 | Cash sessions / drawer reconciliation |
| `/admin/business-costs` | `AdminBusinessCosts` | 868 | Operating expense ledger |
| `/admin/simulation` | `AdminSimulation` | **17,236** | "Calculator" — forecast / break-even / sensitivity (flagged) |

### Growth
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin/growth` | `AdminGrowth` | 864 | Campaigns + loyalty config | Rewards · Tiers · Referrals · Live widgets |
| `/admin/upsell` | `AdminUpsell` | 200 | Bundle ladders + gating | Bundles · Item modifiers |
| `/admin/crosssell` | `AdminCrossSell` | 260 | Pairings / combos / time-of-day / badges | 4 tabs |
| `/admin/scheduled-bundles` | `AdminScheduledBundles` | 253 | Time-windowed bundle scheduling | — |
| `/admin/truck` | `AdminTruck` | 666 | Route + event planning | Events · Routes |

*Upsell / Cross-sell / Scheduled-bundles share `AdminSellingShared.tsx` (1,780 LOC).*

### Intelligence
| Route | Component | LOC | What it is |
|---|---|---|---|
| `/admin/locations` | `AdminLocations` | 392 | Side-by-side location benchmark |
| `/admin/locations/manage` | `AdminLocationsManager` | 584 | Add/edit locations + readiness checklist |
| `/admin/reports/cohort` | `AdminCohortReport` | 513 | Cohort retention / CLTV |
| `/admin/reports/ltv-cac` | `AdminLtvCac` | 498 | LTV / CAC economics |
| `/admin/menu-engineering` | `AdminMenuEngineering` | 648 | Kasavana-Smith quadrants |
| `/admin/ai` | `AdminAI` | 668 | Heuristic insights | (Forecast · Anomalies · Reorder · Staffing · FAQ) |
| `/admin/expansion` | `AdminExpansion` | 470 | New-unit / franchise modelling |

### System
| Route | Component | LOC | What it is | Sub-views |
|---|---|---|---|---|
| `/admin/users` | `AdminUsers` | 1452 | Users & roles | — |
| `/admin/permissions` | `AdminPermissions` | 478 | Granular permission matrix | — |
| `/admin/compliance` | `AdminCompliance` | 393 | Compliance calendar | — |
| `/admin/regulatory-compliance` | `AdminRegulatoryCompliance` | 506 | Disclosures + JPK_V7M export | — |
| `/admin/soc2` | `AdminSoc2` | 125 | SOC 2 controls | — |
| `/admin/audit-log` | `AuditLog` | 354 | Immutable change trail | — |
| `/admin/capabilities` | (server page) | — | Deployed-feature ledger (Rule #9) | — |
| `/admin/currency` | `AdminCurrency` | 278 | Currency switcher config | — |
| `/admin/languages` | `AdminLanguages` | 223 | Language switcher config | — |
| `/admin/settings` | `AdminSettings` | 1317 | Account/business config | General · Layout · Themes · Security · Audit · Advanced |

**In-scope totals:** ~36 admin routes, ~36 page components.

---

## 3. ⭐ THE REAL PROBLEM — controls look dated & inconsistent

The shell and the page skeleton are fine. What makes an average admin page feel
**ugly, inconsistent and poor UI/UX is the control layer**: the buttons, the
location switcher, and the tabs — plus the flat, low-contrast "old admin template"
material they sit on. This is what the redesign must fix first.

### 3.1 Buttons — a primitive that half the code ignores
- A proper `Button` primitive exists (5 variants × 3 sizes, 7px radius, defined
  edges). **But ~43 raw `<button>` elements across in-scope admin bypass it** —
  `AdminMenu` (7), `AdminMenuDetail` (7), `AdminRecipes` (6), `AdminSimulation`
  (5), `AdminSellingShared` (3), `AdminLocationsManager` (3), `AdminGrowth`,
  `AdminSchedule`, `AdminExpansion`, `AdminScheduledBundles` (2 each), and more.
  Each hand-rolled button picks its own height, radius, border and hover → **no
  two pages' buttons match.**
- **`PageHero` actions are forced ICON-ONLY filled squares.** Save, New, Export,
  Refresh all render as the same chunky burgundy/grey square with no label (the
  heavy maroon save block in the Upsell screenshot). You can't tell them apart at
  a glance, the affordance is unclear ("is that a button or a status?"), and a
  filled burgundy square is visually loud for a passive Save. Discoverability and
  scannability both suffer.
- **"One primary per view" is not enforced** — pages that hand-roll buttons end up
  with several equally-weighted CTAs.

### 3.2 Location filter — flat chips that shift and read as dated
`LocationFilter` (the Kraków / Warszawa row) is a loose row of pills:
- **Active vs inactive are styled differently in a jarring way.** Active =
  `--brand-soft` fill with `border-color: transparent`; inactive = transparent
  fill with a 1px hairline border + **low-contrast `--fg-subtle` text**. So the
  active pill *drops its border* (a 1px layout nudge) and the inactive cities are
  hard to read. It reads as "one filled chip + some greyed-out text," not a clean
  segmented switch.
- **No container / grouping.** They're bare chips floating on the panel, not an
  integrated segmented control — the dated "2019 admin" look. Hover is just a flat
  background tint.
- It sits in its **own hero row**, visually disconnected from the filter/nav tabs
  directly below it — even though all three are "switchers."

### 3.3 Tabs — two different idioms stacked in one header
`Tabs` ships **two variants that look nothing alike** — `pill` (filter) and
`underline` (sub-view nav) — and the hero routinely stacks **three different
control idioms on top of each other**:

```
row 3:  ◉ Kraków   ○ Warszawa        ← burgundy-soft location PILLS
row 4:  [ All ][ Open ][ Closed ]    ← pill filter TABS  (different pill)
row 5:   Bundles   Item modifiers    ← thin UNDERLINE tabs (different again)
```

Three visually distinct "tab/pill" treatments in one ~120px header is exactly the
busy, incoherent feeling. Underline tabs are a thin, easily-missed, dated pattern;
choosing pill-vs-underline for conceptually identical "switch the view" actions is
arbitrary and reads as inconsistency.

### 3.4 Overall material — flat, low-contrast, "old"
Transparent pills + hairline borders + `*-soft` tinted active states + flat
hover-tint = a muted, depth-less surface that looks like a generic admin template.
There's no segment grouping, no tactile state, low text contrast on inactive
controls. Compounding it:
- **The Growth "selling" family never migrated off legacy `glass-card`** —
  `AdminUpsell` (5 `glass-card`, 0 `<Card>`), `AdminCrossSell` (11/0),
  `AdminScheduledBundles` (3/0), `AdminCorporate` (3/0), `AdminSellingShared`
  (7/0). Everywhere else is the `<Card>` primitive. **This family is the page in
  the screenshot — it's the most-dated island.**
- **`glass-input` is still used 38×** (legacy alias of the `Input` primitive),
  concentrated in those same pages.

### 3.5 Token discipline — ~36 raw hex literals
Status/chart colours hardcoded instead of tokens (Rule: all colour from tokens):
`#ef4444` ×6, `#f59e0b` ×5, `#38bdf8` ×4, `#34d399` ×4, `#10b981` ×4, `#dc2626`
×2, `#94a3b8` ×2, `#28a06d` ×2, `#15171c` ×2, `#ec4899` ×1. (Only the four
`Explainers` accent rails are a sanctioned exception.)

---

## 4. Secondary inconsistencies (clean up alongside)

- **Save / dirty / saved** is expressed differently on every editor page (only
  `AdminUpsell`/`AdminCrossSell` use the icon-only `saved`-state pattern). → one
  shared `SaveAction`.
- **Loading pill copy is hand-written per page** ("Loading Cross-sell…") and 3
  pages still say bare `Loading…`. → a `<PageLoading label>` wrapper.
- **Error / empty states are bespoke** — some `EmptyState`, some hand-built
  `glass-card`. → standardise.
- **Sub-view (`nav`) tab grammar varies** (view-mode vs domain-section vs
  analysis-type) with no rule for when a page earns sub-views. → write the rule.
- **`AdminSimulation` is a 17k-LOC monolith** (32% of all admin component code) —
  flag for decomposition before it diverges further.

---

## 5. Recommended redesign order

1. **Redesign the control layer (Section 3.1–3.4) first** — this is the brief:
   - Rework **buttons**: ban raw `<button>` in admin pages (everything through the
     primitive); rethink the icon-only hero action (label the primary, or use a
     clearer compact treatment); enforce one primary per view.
   - Rework the **location switcher** into a single integrated segmented control
     (consistent active/inactive weight, no border shift, readable inactive text).
   - **Unify tabs** to one idiom (or a clear rule: pill = filter, underline =
     sub-nav) and tighten the hero so three switchers don't fight.
   - Refresh the **material** (depth, contrast, hover) away from the flat template.
2. **Migrate the Growth/selling family** (`AdminUpsell`, `AdminCrossSell`,
   `AdminScheduledBundles`, `AdminCorporate`, `AdminSellingShared`) to `<Card>` —
   fixes the screenshot page.
3. **Token-sweep** the ~36 inline hex; retire `glass-card`/`glass-input` aliases.
4. **Shared `SaveAction` / `PageLoading` / error+empty** wrappers, adopted across
   every editor page in one pass.
5. Write the "when a page earns sub-views" rule into the design-system docs.
6. Schedule `AdminSimulation` decomposition separately.

Every code change lands with its matching `docs/design-system/admin/**` doc edit
in the same commit (Rule #11); operator-visible primitives get a
`/admin/capabilities` entry (Rule #9).

---

*Pre-redesign snapshot. `/core/*` deliberately excluded. Audits under
`docs/audits/` are historical and never edited retroactively (Rule #11).*
