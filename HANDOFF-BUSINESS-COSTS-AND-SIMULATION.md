# Handoff — Business costs ledger + Finance simulation sandbox

Complete specification of two features built on branch
`claude/add-business-costs-tab-NsGp0`. Hand this document to another
model / engineer along with the codebase. Every section names the
exact file paths and the existing patterns to reuse.

The branch contains 7 commits with working code. List them with:

```bash
git log --oneline da863e2..HEAD
```

If you want a clean re-implementation, ignore the branch and rebuild
from this spec on a fresh branch off `main`. The spec is self-
contained.

---

## Project constraints (must read first)

This codebase has hard rules in `CLAUDE.md`. The relevant ones:

1. **NEVER use hardcoded / mock data.** Every feature wires to real
   data via `src/lib/store.ts` (`readJSON` / `writeJSON`).
2. **Serverless deployment — NEVER use raw `fs`.** Use `readJSON` /
   `writeJSON` which transparently handle Neon Postgres (when
   `DATABASE_URL` is set) and filesystem fallback for local dev.
3. **No server-side modules in `"use client"` components.** If a
   client component needs data, fetch via an API route.
4. **All modals MUST use `createPortal(modal, document.body)`** — the
   admin layout sets `position: relative; z-index: 1` on children of
   `.admin-bg`, trapping fixed-position elements.
5. **Place new user-facing features prominently** in nav.
6. **Toggles must persist immediately** — call PUT on flip, no
   separate Save button.
7. **Verify full data flow end-to-end** before committing.
8. **Register every new capability** in `/admin/capabilities`
   (`src/app/admin/capabilities/page.tsx`).
9. **Use the v2 design system** — `glass-card`, `glass-input`,
   `glass-btn`, `admin-text` for legacy pages; new pages use the
   `AdminShell` + nav from `src/components/admin/v2/`.

---

## Feature 1 — Business costs ledger

Operating-expense register at `/admin/business-costs` for payroll,
rent, utilities, fuel, insurance, licences, software, marketing, and
one-off purchases. Recurring amounts normalise to monthly grosze so
chain-wide totals stay comparable. Manager + owner only.

### Data model

Add to `src/data/types.ts`:

```typescript
export type BusinessCostCategory =
  | "payroll"
  | "rent"
  | "utilities"
  | "insurance"
  | "fuel"
  | "vehicle"
  | "maintenance"
  | "licenses"
  | "marketing"
  | "ingredients"
  | "equipment"
  | "software"
  | "professional"
  | "tax"
  | "other";

/** Sub-role used when category=payroll so KPIs can split labor by craft. */
export type BusinessCostPayrollRole =
  | "pizzaiolo"
  | "chef"
  | "sous-chef"
  | "kitchen-porter"
  | "waiter"
  | "barista"
  | "driver"
  | "manager"
  | "cleaner"
  | "other";

export type BusinessCostFrequency =
  | "one-off"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type BusinessCostStatus = "active" | "archived";

export interface BusinessCost {
  id: string;
  name: string;
  category: BusinessCostCategory;
  payrollRole?: BusinessCostPayrollRole;
  vendor?: string;
  amountGrosze: number;
  frequency: BusinessCostFrequency;
  /** Location slug, or undefined for chain-wide. */
  locationSlug?: string;
  status: BusinessCostStatus;
  startDate?: string;
  endDate?: string;
  nextDueDate?: string;
  paymentMethod?: "card" | "bank-transfer" | "cash" | "direct-debit" | "other";
  taxDeductible?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Store layer

Append to `src/lib/store.ts`:

```typescript
const BUSINESS_COSTS_KEY = "business-costs.json";

export interface BusinessCostFilters {
  locationSlug?: string;
  category?: BusinessCost["category"];
  status?: BusinessCost["status"];
}

export async function getBusinessCosts(
  filters?: BusinessCostFilters,
): Promise<BusinessCost[]> {
  const all = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
  let list = all;
  if (filters?.locationSlug) {
    list = list.filter((c) => !c.locationSlug || c.locationSlug === filters.locationSlug);
  }
  if (filters?.category) list = list.filter((c) => c.category === filters.category);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  return list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getBusinessCost(id: string): Promise<BusinessCost | null> {
  const list = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
  return list.find((c) => c.id === id) ?? null;
}

export async function saveBusinessCost(
  input: Omit<BusinessCost, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<BusinessCost> {
  return withLock(BUSINESS_COSTS_KEY, async () => {
    const list = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
    const now = new Date().toISOString();
    const cost: BusinessCost = {
      id: input.id || `cost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      category: input.category,
      payrollRole: input.payrollRole,
      vendor: input.vendor,
      amountGrosze: Math.max(0, Math.round(input.amountGrosze)),
      frequency: input.frequency,
      locationSlug: input.locationSlug,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      nextDueDate: input.nextDueDate,
      paymentMethod: input.paymentMethod,
      taxDeductible: input.taxDeductible,
      notes: input.notes,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    const i = list.findIndex((c) => c.id === cost.id);
    if (i >= 0) list[i] = cost;
    else list.push(cost);
    await writeJSON(BUSINESS_COSTS_KEY, list);
    return cost;
  });
}

export async function deleteBusinessCost(id: string): Promise<boolean> {
  return withLock(BUSINESS_COSTS_KEY, async () => {
    const list = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
    const filtered = list.filter((c) => c.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON(BUSINESS_COSTS_KEY, filtered);
    return true;
  });
}
```

### API route

`src/app/api/admin/business-costs/route.ts` — GET / POST / PUT / DELETE.

- GET filters by `?location=`, `?category=`, `?status=`.
- POST + PUT both call the same `upsert(req)` helper.
- DELETE takes `?id=`.
- All guarded with `withAdmin({ roles: ["manager", "owner"] }, ...)`.
- Validate `category`, `frequency`, `status`, `payrollRole` against the
  literal type lists. Reject `locationSlug` if the session lacks scope
  via `hasLocationAccess(slug)`.

Use the same `withAdmin` middleware pattern as existing routes
(`src/lib/api-middleware.ts`).

### Page + component

- Page: `src/app/admin/business-costs/page.tsx` — server component
  that gates on `isAuthenticated()` then renders `<AdminBusinessCosts />`.
- Component: `src/components/admin/AdminBusinessCosts.tsx` — `"use
  client"`. Uses v2 primitives from `./v2/ui`: `Card`, `CardHeader`,
  `CardBody`, `Button`, `Input`, `Select`, `Badge`, `Tabs`, `Table`,
  `Dialog`, `ConfirmDialog`, `EmptyState`. Uses `KpiCard` from
  `./v2/charts`.

UI structure:

1. **Header** — title + subtitle + "New cost" button.
2. **KPI strip** (`<section className="v2-kpi-grid">`):
   - Monthly recurring
   - Annualised (monthly × 12)
   - Monthly payroll (subset where category === payroll)
   - One-off (last 30 days)
3. **Two side-by-side cards**:
   - By category — list of categories ranked by monthly total, with %.
   - Payroll breakdown — list of payroll roles ranked by monthly cost.
4. **Due soon** card — recurring bills with `nextDueDate` within 14 days.
5. **Filters row** — search input, category select, status Tabs
   (active / archived / all).
6. **Table** of business costs with columns: name, category, location,
   amount, monthly equivalent, next due, status, actions (Edit /
   Archive / Delete).
7. **Edit dialog** — full form with all `BusinessCost` fields. Uses
   `Dialog` size="lg".
8. **Confirm dialog** for delete.

The frequency-to-month conversion table:

```typescript
const FREQUENCY_TO_MONTHS: Record<BusinessCostFrequency, number> = {
  "one-off": 0,
  daily: 30.4375,
  weekly: 4.345,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

function monthlyGrosze(c: BusinessCost): number {
  return Math.round(c.amountGrosze * FREQUENCY_TO_MONTHS[c.frequency]);
}
```

### Nav

Add to the Finance section in `src/components/admin/v2/nav.config.ts`:

```typescript
{ href: "/admin/business-costs", label: "Business costs", icon: Wallet, requiredRole: "manager" },
```

Import `Wallet` from `lucide-react` at the top of the same file.

### Capability registration

Add to `src/app/admin/capabilities/page.tsx` (in the Operations group,
near the Cash entry):

```typescript
{
  name: "Business costs ledger",
  status: "live",
  href: "/admin/business-costs",
  summary:
    "Operating expense register — payroll (pizzaiolo, chefs, waiting staff), rent, utilities, fuel, insurance, licenses, software, one-off purchases. Recurring amounts auto-normalised to grosze/month for like-for-like totals; KPI cards show monthly recurring, annualised, payroll subtotal, and one-off spend over the last 30 days. Per-location scoping (or chain-wide), category and payroll-role breakdowns, archive vs delete, next-due reminders.",
},
```

---

## Feature 2 — Finance simulation sandbox

Sandbox monthly P&L modeller at `/admin/simulation`. Lets the operator
input volume / ticket / labor / fixed costs and see net profit, margin,
break-even, sensitivity, 2D matrices, archetype comparison, 12-month
projection — all live. Defaults reflect a Neapolitan pizza truck in
Warsaw 2026. **Zero writes to the business-costs ledger** — runs on
its own kv key. **Gated behind a master toggle** (off by default).

### Master toggle (Rule 6 + Rule 7 compliance)

Add to `AppSettings` in `src/lib/store.ts`:

```typescript
export interface AppSettings {
  // ... existing fields ...
  simulationEnabled?: boolean;
}
```

The toggle persists immediately on flip — no Save button — both on the
desktop `AdminSettings` page (General tab) and the mobile
`MobileSettings` page. After PUT, dispatch a window event so the nav
surfaces refresh without a page reload:

```typescript
window.dispatchEvent(new Event("sud-admin-settings-updated"));
```

### Nav gating (hidden when toggle off)

Extend `NavItem` in `src/components/admin/v2/nav.config.ts`:

```typescript
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  requiredRole?: AdminRole;
  /** Optional settings-driven gate. */
  featureFlag?: "simulation";
}
```

Update `filterNavForRole` to also accept a flags map:

```typescript
export function filterNavForRole(
  role: AdminRole | null,
  flags?: { simulation?: boolean },
): NavSection[] {
  if (!role) return [];
  const userRank = ROLE_RANK[role];
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.requiredRole && ROLE_RANK[item.requiredRole] > userRank) return false;
      if (item.featureFlag === "simulation" && !flags?.simulation) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}
```

Add the Simulation entry in the Finance section:

```typescript
{ href: "/admin/simulation", label: "Simulation", icon: LineChart, requiredRole: "manager", featureFlag: "simulation" },
```

Import `LineChart` from `lucide-react`.

In `src/components/admin/v2/Sidebar.tsx` and
`src/components/admin/v2/mobile/MoreDrawer.tsx`, fetch settings on
mount, listen for the `sud-admin-settings-updated` event, and pass the
flag into `filterNavForRole`:

```typescript
const [simulationEnabled, setSimulationEnabled] = useState(false);
useEffect(() => {
  let cancelled = false;
  const loadSettings = () => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setSimulationEnabled(!!j.simulationEnabled);
      })
      .catch(() => {});
  };
  loadSettings();
  window.addEventListener("sud-admin-settings-updated", loadSettings);
  return () => {
    cancelled = true;
    window.removeEventListener("sud-admin-settings-updated", loadSettings);
  };
}, []);

const sections = useMemo(
  () => role ? filterNavForRole(role, { simulation: simulationEnabled }) : NAV_SECTIONS,
  [role, simulationEnabled],
);
```

### Page redirect gate

`src/app/admin/simulation/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSettings } from "@/lib/store";
import { AdminSimulation } from "@/components/admin/AdminSimulation";

export default async function AdminSimulationPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const settings = await getSettings();
  if (!settings.simulationEnabled) redirect("/admin/settings");
  return <AdminSimulation />;
}
```

### Data model

Add to `src/data/types.ts`:

```typescript
export interface SimulationLaborLine {
  id: string;
  role: BusinessCostPayrollRole;
  headcount: number;
  hoursPerWeek: number;
  hourlyRateGrosze: number;
}

export interface SimulationSeasonality {
  winter: number;  // Dec/Jan/Feb multiplier on ordersPerDay
  spring: number;  // Mar/Apr/May
  summer: number;  // Jun/Jul/Aug
  autumn: number;  // Sep/Oct/Nov
}

export interface SimulationMenuMixLine {
  menuItemId: string;
  weight: number;  // 0–1; mix sums to ~1 (auto-normalised in math)
}

export interface SimulationScenario {
  ordersPerDay: number;
  avgTicketGrosze: number;
  daysOpenPerMonth: number;
  cogsPct: number;
  labor: SimulationLaborLine[];
  fixedCosts: Partial<Record<BusinessCostCategory, number>>;
  wageInflationPct?: number;
  ingredientInflationPct?: number;
  paymentProcessorPct?: number;
  setupCostGrosze?: number;
  seasonality?: SimulationSeasonality;
  menuMix?: SimulationMenuMixLine[];
  menuMixLocation?: string;
  updatedAt: string;
}
```

### Store layer

Append to `src/lib/store.ts`:

```typescript
const SIMULATION_KEY = "simulation-scenarios.json";

export function defaultSimulationScenario(): SimulationScenario {
  // Warsaw 2026 brutto × 1.22 employer narzut (ZUS social + Labour
  // Fund), rounded to the nearest 50 grosze. 12:00–22:00 service +
  // ~1 h prep + ~1 h close-down = ~11 h staff day, 6 days/week.
  const labor: SimulationLaborLine[] = [
    { id: "pizzaiolo",     role: "pizzaiolo",     headcount: 2, hoursPerWeek: 66, hourlyRateGrosze: 4300 },
    { id: "chef",          role: "chef",          headcount: 1, hoursPerWeek: 66, hourlyRateGrosze: 3700 },
    { id: "sous-chef",     role: "sous-chef",     headcount: 1, hoursPerWeek: 48, hourlyRateGrosze: 3300 },
    { id: "barista",       role: "barista",       headcount: 1, hoursPerWeek: 60, hourlyRateGrosze: 3900 },
    { id: "waiter",        role: "waiter",        headcount: 2, hoursPerWeek: 60, hourlyRateGrosze: 4000 },
    { id: "kitchen-porter",role: "kitchen-porter",headcount: 1, hoursPerWeek: 36, hourlyRateGrosze: 3000 },
    { id: "manager",       role: "manager",       headcount: 1, hoursPerWeek: 50, hourlyRateGrosze: 5500 },
  ];
  const fixedCosts: SimulationScenario["fixedCosts"] = {
    rent: 250_000,         // 2 500 zł — Warsaw food-truck pitch (range 1 200–3 000)
    utilities: 120_000,    // 1 200 zł — electric + water + gas
    fuel: 80_000,          //   800 zł — vehicle + generator
    vehicle: 70_000,       //   700 zł — maintenance + amortyzacja
    insurance: 60_000,     //   600 zł — OC działalności + truck OC/AC
    licenses: 25_000,      //   250 zł — SANEPID + permits amortised
    marketing: 150_000,    // 1 500 zł
    software: 25_000,      //   250 zł — GoPOS Pro + KDS + analytics
    professional: 40_000,  //   400 zł — biuro rachunkowe ryczałt
    tax: 180_000,          // 1 800 zł — ZUS właściciel + lokalne opłaty
    maintenance: 40_000,
    other: 30_000,
  };
  return {
    ordersPerDay: 70,           // ~7/h across the 10 h service window
    avgTicketGrosze: 6500,      // 65 zł blended pizza + coffee + dessert
    daysOpenPerMonth: 28,
    cogsPct: 0.30,              // Polish pizzeria benchmark 25–35%
    labor,
    fixedCosts,
    wageInflationPct: 0.07,
    ingredientInflationPct: 0.04,
    paymentProcessorPct: 0.019, // Stripe blended
    setupCostGrosze: 25_000_000, // 250 000 zł — truck buildout + working capital
    seasonality: { winter: 0.70, spring: 1.00, summer: 1.30, autumn: 1.00 },
    updatedAt: new Date().toISOString(),
  };
}

export async function getSimulationScenario(): Promise<SimulationScenario> {
  const saved = await readJSON<Partial<SimulationScenario> | null>(SIMULATION_KEY, null);
  if (!saved || !Array.isArray(saved.labor) || typeof saved.ordersPerDay !== "number") {
    return defaultSimulationScenario();
  }
  const defaults = defaultSimulationScenario();
  // Hydrate every optional field from defaults so old scenarios stay
  // forward-compatible after new assumptions land.
  return {
    ordersPerDay: saved.ordersPerDay,
    avgTicketGrosze: saved.avgTicketGrosze ?? defaults.avgTicketGrosze,
    daysOpenPerMonth: saved.daysOpenPerMonth ?? defaults.daysOpenPerMonth,
    cogsPct: typeof saved.cogsPct === "number" ? saved.cogsPct : defaults.cogsPct,
    labor: saved.labor.length > 0 ? saved.labor : defaults.labor,
    fixedCosts: saved.fixedCosts ?? defaults.fixedCosts,
    wageInflationPct: saved.wageInflationPct ?? defaults.wageInflationPct,
    ingredientInflationPct: saved.ingredientInflationPct ?? defaults.ingredientInflationPct,
    paymentProcessorPct: saved.paymentProcessorPct ?? defaults.paymentProcessorPct,
    setupCostGrosze: saved.setupCostGrosze ?? defaults.setupCostGrosze,
    seasonality: saved.seasonality ?? defaults.seasonality,
    menuMix: Array.isArray(saved.menuMix) ? saved.menuMix : undefined,
    menuMixLocation: typeof saved.menuMixLocation === "string" ? saved.menuMixLocation : undefined,
    updatedAt: saved.updatedAt ?? defaults.updatedAt,
  };
}

export async function saveSimulationScenario(scenario: SimulationScenario): Promise<SimulationScenario> {
  return withLock(SIMULATION_KEY, async () => {
    // Clamp numeric inputs to sane ranges; filter malformed mix lines.
    const clean: SimulationScenario = { /* ... clamped fields ... */ };
    await writeJSON(SIMULATION_KEY, clean);
    return clean;
  });
}

/** One-way derive from the real business-costs ledger — used by the
 *  "Seed from last 30 days" button. Reads costs, groups recurring
 *  payroll by role, folds non-payroll into fixedCosts. NEVER writes. */
export async function seedSimulationFromHistory(): Promise<SimulationScenario> {
  // see commit 04cab2a — straightforward map/reduce over getBusinessCosts
}
```

### API routes

#### `src/app/api/admin/simulation/route.ts`

- `GET` returns `getSimulationScenario()`. `GET ?seed=1` returns
  `seedSimulationFromHistory()` (one-way derivation, no DB write).
- `PUT` validates the scenario shape and saves via
  `saveSimulationScenario()`. Appends an audit log entry.
- Manager + owner only via `withAdmin`.

#### `src/app/api/admin/simulation/menu/route.ts` (NEW endpoint)

Returns menu items for a location annotated with recipe-derived costs
and last-30-day order quantities. Used by the Menu Mix card. Reuses
the recipe roll-up pattern from `src/app/api/admin/menu/route.ts`:

```typescript
const ingPrice = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));
const recipeCost = new Map<string, number>();
for (const r of recipes) {
  if (r.ingredients.length === 0) continue;
  let total = 0;
  for (const ri of r.ingredients) {
    const unitCost = ingPrice.get(ri.ingredientId) ?? 0;
    total += unitCost * ri.quantity * (ri.wasteFactor || 1);
  }
  recipeCost.set(r.menuItemId, Math.round(total / (r.yieldPortions || 1)));
}
```

Response shape:

```typescript
{
  location: string;
  items: Array<{
    id: string;
    name: string;
    category: MenuCategory;
    priceGrosze: number;
    costGrosze: number;          // operator-maintained MenuItem.cost
    recipeCostGrosze: number;    // rolled up from recipe + ingredients
    recentQty: number;           // last 30 days, non-cancelled
  }>;
}
```

### Component — `src/components/admin/AdminSimulation.tsx`

`"use client"`. The most complex component in this work. Top-to-bottom
structure:

1. **Header** with title, amber "Sandbox — not the real ledger"
   badge, subtitle, action buttons: Reset defaults, Seed from last
   30 days, Save scenario. Auto-saves on edits with a 1 s debounce.

2. **KPI strip 1** — Monthly revenue, Total cost, Net profit
   (green/red tone), Break-even orders/day.

3. **Inputs row** (3 cards): Revenue inputs, Labor mix (per-role
   table with add/remove rows), Fixed monthly costs (one input per
   `BusinessCostCategory`).

4. **Menu Mix card** — list every menu item for the selected location
   with: name, recent-order badge, price, recipe-derived food cost,
   margin %, weight input (% of orders). Total weight indicator.
   Action buttons: location switcher, "Auto-fill (30 d)" (sets
   weights from `recentQty`), "Disable mix". When any weight > 0,
   the avg ticket + cogsPct inputs above flip to read-only and show
   the derived values.

5. **KPI strip 2 (Operations)** — Labor % revenue (target ≤ 30%,
   tone flips), Prime cost % (COGS + labor, ≤ 60–65%), Revenue per
   labor hour, Net profit per order, Setup payback (months).

6. **P&L breakdown** + Cost-share pie chart side-by-side. The
   breakdown has drill-down rows for labor by role and fixed costs
   by category.

7. **Scenario comparison** — 3 columns:
   - Conservative: −15% orders, +2 pp COGS
   - Realistic: current
   - Optimistic: +15% orders, −2 pp COGS
   Each column shows net profit, margin, revenue, total cost, orders,
   break-even, COGS, prime cost.

8. **Two 2D heatmaps** (`Heatmap` from `./v2/charts`):
   - Orders × ticket ±30%
   - Food cost × ticket
   Both show net profit per cell in złoty; centre cell = current
   scenario.

9. **Assumptions card** — sliders / inputs for wage inflation,
   ingredient inflation, card processor fee, setup cost, four
   seasonal volume multipliers (winter / spring / summer / autumn).

10. **12-month projection** (`LineChart`) — 5 series (revenue, labor,
    COGS, fixed, net profit). Compounds monthly inflation and applies
    seasonal multiplier per quarter. Bottom KPI strip: 12-mo revenue,
    total cost, net profit, best/worst month swing.

11. **Break-even multi-horizon** — Orders/hour, /day, /month, plus
    revenue/month.

12. **Sensitivity row** — 5 small KPI cards showing net profit at
    volume ±20%, ±10%, 0.

13. **Confirm dialogs** for "Seed from last 30 days" and "Reset
    defaults".

#### Math helpers (pure functions)

`WEEKS_PER_MONTH = 4.345`

```typescript
// monthlyRevenue = ordersPerDay × avgTicket × daysOpen
// monthlyCogs = monthlyRevenue × cogsPct
// laborMonthly = Σ headcount × hoursPerWeek × WEEKS_PER_MONTH × rate
// fixedTotal = Σ fixedCosts
// paymentFees = monthlyRevenue × paymentProcessorPct
// totalCost = cogs + labor + fixed + paymentFees
// netProfit = revenue − totalCost
// margin = netProfit / revenue
// contributionPerOrder = avgTicket × (1 − cogsPct − paymentProcessorPct)
// breakEvenOrdersPerMonth = (labor + fixed) / contributionPerOrder
// breakEvenOrdersPerDay = breakEvenOrdersPerMonth / daysOpen
// laborPct = labor / revenue
// primeCostPct = (cogs + labor) / revenue
// revenuePerLaborHour = revenue / Σ labor hours
// profitPerOrder = netProfit / (ordersPerDay × daysOpen)
// paybackMonths = setupCost / netProfit (null when netProfit ≤ 0)
```

For the 12-month projection: convert annual inflation rates to monthly
via `(1 + annual)^(1/12) − 1`. Compound month-over-month. Apply the
seasonal multiplier looked up via:

```typescript
const MONTH_TO_SEASON = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter",
];
```

For the menu-mix derivation:

```typescript
function deriveMixValues(mix, menuSnapshot) {
  // Skip when mix is empty.
  let weightedPrice = 0, weightedCost = 0, totalWeight = 0;
  for (const line of mix) {
    const item = menuSnapshot.find(m => m.id === line.menuItemId);
    if (!item || line.weight <= 0) continue;
    weightedPrice += line.weight * item.priceGrosze;
    weightedCost  += line.weight * item.recipeCostGrosze;
    totalWeight   += line.weight;
  }
  if (totalWeight <= 0) return null;
  return {
    avgTicketGrosze: Math.round(weightedPrice / totalWeight),
    cogsPct: weightedPrice > 0 ? weightedCost / weightedPrice : 0,
  };
}
```

Use the derived values to build an `effectiveScenario` via
`useMemo`, then pass that into every downstream calculation
(`computeScenario`, `buildMatrix`, `deriveArchetypes`,
`projectTwelveMonths`, the sensitivity row).

### Settings UI — desktop

In `src/components/admin/AdminSettings.tsx`, General tab, add a card
**"Finance simulation (sandbox)"** with a checkbox bound to
`settings.simulationEnabled`. On change, immediately PUT to
`/api/admin/settings` with `{ simulationEnabled: next }` and dispatch
the window event.

### Settings UI — mobile

The mobile Settings page is a **separate component**:
`src/components/admin/mobile/MobileSettings.tsx`. The desktop toggle
won't appear there. Add a matching `Section` with a `ToggleField`
component (`<label>` wrapping `<input type="checkbox">` styled per
the mobile design tokens) that calls the same PUT + event.

### Capability registration

```typescript
{
  name: "Finance simulation (sandbox P&L)",
  status: "live",
  href: "/admin/simulation",
  summary:
    "Sandbox monthly P&L wired to real menu / recipe / ingredient data. Inputs: orders/day, ticket, labor mix, fixed costs (or weighted menu mix). Outputs: revenue, cost-by-category, net profit, margin, break-even (per hour / day / month / revenue), labor % vs benchmarks, prime cost %, payback months, two 2-D heatmaps (orders × ticket, food cost × ticket), Conservative / Realistic / Optimistic comparison, ±20% volume sensitivity, 12-month projection with inflation + seasonality. Master toggle in Settings → General. Defaults: Warsaw 2026 (brutto × 1.22 ZUS narzut, food-truck pitch fees, 30% COGS, 65 zł ticket).",
},
```

---

## Warsaw 2026 research data (used for the defaults)

Sources researched May 2026:

| Item | Value | Source |
|---|---|---|
| Polish min wage 2026 | 4 806 zł brutto / 30,04 zł/h; zlecenie 31,40 zł/h | [Infor](https://kadry.infor.pl/kadry/wynagrodzenia/wynagrodzenie-minimalne/7494371,najnizsza-krajowa-2026-netto-ile-wynosi-na-godzine-na-reke.html) |
| Pizzaiolo brutto Warsaw | 22 zł entry → 35 zł average → 50 zł premium Neapolitan | [Comfort Food Studio](https://comfortfoodstudio.pl/ile-zarabia-pizzerman-w-polsce-i-za-granica-aktualne-zarobki-2026/) |
| Waiter brutto Warsaw | 31,40 → 33,63 avg → 35–45 experienced | [GoWork](https://www.gowork.pl/poradnik/17/zarobki/ile-zarabia-kelner-czy-ta-praca-sie-oplaca/) |
| Barista brutto Warsaw | 31,5 → 33,5 zł/h | [Jooble Warsaw](https://pl.jooble.org/praca-kawiarni-barista/Warszawa) |
| Pomoc kuchenna Warsaw | 26 → 32 zł/h | Jooble |
| Manager restauracji Warsaw | 7 000 → 8 000 zł/mo (~45 zł/h on 50 h schedule) | [Zarabiaj](https://www.zarabiaj.pl/zarobki/ile-zarabia-menadzer-restauracji/) |
| Employer narzut (ZUS pracodawcy) | +20–22% on top of brutto | [Podatnik.info](https://www.podatnik.info/publikacje/calkowity-koszt-zatrudnienia-pracownika-w-2026-roku,6632e9) |
| Food-truck pitch fee Warsaw | 1 200–3 000 zł/mo | [Sadowski](https://sadowski.edu.pl/ile-mozna-zarobic-na-food-trucku-poznaj-realne-zyski-i-koszty) |
| Food-truck insurance OC | 400–1 000 zł/mo | [CUK](https://cuk.pl/porady/ubezpieczenie-food-trucka) |
| GoPOS Pro subscription | 99 zł/mo annual / 129 zł/mo monthly | [GoPOS](https://gopos.pl/pl/pricing) |
| Biuro rachunkowe ryczałt | 200–400 zł/mo | [Lex Audyt](https://lexaudyt.pl/cennik-uslug-ksiegowych-w-warszawie/) |
| Food cost % Polish pizzeria | 25–35% benchmark | [Restaumatic](https://www.restaumatic.com/blog/food-cost-co-to-jest-i-jak-jego-obliczenie-pomoze-obnizyc-koszty/) |
| Avg pizza price Warsaw | 27 zł | [eWarszawa](https://ewarszawa.pl/news-news-3886-ile_kosztuje_pizza_w_warszawie_publikujemy_liste_11_naszym_zdaniem_najlepszych_pizzerii_w_stolicy) |
| Avg restaurant bill Poland Jan 2025 | 64,18 zł (small chains 72 zł) | (industry data) |

The defaults bake the ZUS narzut into the hourly rate so
`headcount × hours × rate` lands at full employer cost.

---

## Existing primitives to reuse (don't reinvent)

| Need | Source |
|---|---|
| Storage abstraction (Postgres + fs fallback) | `src/lib/store.ts` → `readJSON` / `writeJSON` / `withLock` |
| Auth middleware | `src/lib/api-middleware.ts` → `withAdmin({ roles: [...] }, handler)` |
| Admin auth | `src/lib/admin-auth.ts` → `isAuthenticated()`, `hasLocationAccess(slug)` |
| Currency formatter | `src/lib/utils.ts` → `formatPrice(grosze)` |
| Audit log | `src/lib/store.ts` → `appendAuditLog({ actor, action, before, after })` |
| Active locations | `src/data/locations.ts` → `getActiveLocations()` |
| Menu data | `src/data/menus/index.ts` → `getMenuWithOverrides(slug)` |
| Recipe rollup | mirror `getRecipeCostMap()` in `src/app/api/admin/menu/route.ts` |
| UI primitives | `src/components/admin/v2/ui` → `Card`, `Button`, `Input`, `Select`, `Badge`, `Tabs`, `Table`, `Dialog`, `ConfirmDialog`, `EmptyState`, `Toast` |
| Charts | `src/components/admin/v2/charts` → `KpiCard`, `PieChart`, `LineChart`, `BarChart`, `AreaChart`, `Sparkline`, `Heatmap` |
| Toast | `src/components/admin/v2/ui/Toast` → `useToast()` |
| Nav config | `src/components/admin/v2/nav.config.ts` |
| Mobile shell | `src/components/admin/v2/mobile/MobileShell.tsx` (renders MoreDrawer + BottomNav + Topbar) |

---

## Verification checklist

1. `npx tsc --noEmit` — clean.
2. `npx eslint` on every changed file — only pre-existing warnings.
3. `npx next build` — `/admin/business-costs`, `/admin/simulation`,
   `/api/admin/business-costs`, `/api/admin/simulation`,
   `/api/admin/simulation/menu` all appear in the route table.
4. Manual flow:
   - Toggle simulation in Settings → General → page reachable.
   - Toggle off → page redirects to Settings.
   - Open `/admin/simulation` → defaults render, KPIs non-zero.
   - Edit `ordersPerDay` 70 → 100, watch every KPI / chart / matrix
     update live (no Save click needed thanks to 1 s debounce).
   - Set a menu-mix weight on Margherita → avg ticket + COGS update,
     pie / KPIs / matrices reflect the new ratio.
   - "Auto-fill (30 d)" sets weights from real order history without
     touching `orders.json`.
   - "Seed from last 30 days" populates payroll + fixed costs from
     `business-costs.json` without modifying it.
   - `/admin/business-costs` shows the new entries, deletes / archive
     /  restore all work.
   - `/admin/capabilities` lists both new features as `live`.

---

## Known issue not resolved on this branch

A mobile-dashboard layout regression was reported on the Vercel
preview during this work (content edge-to-edge, "Reports" link cut
off, FAB overlapping content). After reverting **all seven** commits
from this branch (verified: `git diff merge-base..HEAD` returns zero
lines) the preview still showed the issue — so it's almost certainly
not in this code. Suspects to investigate when re-implementing:

1. **Vercel preview cache** — try a manual redeploy with
   "Use existing build cache" disabled.
2. **Build-time env divergence** between preview and production.
3. **Browser/CDN cache** — the user's screenshots both came from
   `*.vercel.app` URLs; a hard refresh wasn't confirmed.
4. **`--m-page-pad-x` CSS variable** — defined on
   `[data-admin-theme]` in `globals.css:5206`. If the
   `themeBootScript` (`src/components/admin/v2/theme.ts`) doesn't
   run, the variable goes undefined and pages render edge-to-edge.
   Verify the inline `<script>` in `src/app/admin/layout.tsx` is
   present in the rendered HTML.

---

## Files touched on the branch (reference)

```
NEW  src/app/admin/business-costs/page.tsx
NEW  src/app/admin/simulation/page.tsx
NEW  src/app/api/admin/business-costs/route.ts
NEW  src/app/api/admin/simulation/route.ts
NEW  src/app/api/admin/simulation/menu/route.ts
NEW  src/components/admin/AdminBusinessCosts.tsx
NEW  src/components/admin/AdminSimulation.tsx
MOD  src/app/admin/capabilities/page.tsx
MOD  src/components/admin/AdminSettings.tsx
MOD  src/components/admin/mobile/MobileSettings.tsx
MOD  src/components/admin/v2/Sidebar.tsx
MOD  src/components/admin/v2/mobile/MoreDrawer.tsx
MOD  src/components/admin/v2/nav.config.ts
MOD  src/data/types.ts
MOD  src/lib/store.ts
```

All source files are recoverable at commit `de58b6e` on the branch
`claude/add-business-costs-tab-NsGp0`. Check it out to study patterns,
copy implementations, or salvage anything useful for the
re-implementation.
