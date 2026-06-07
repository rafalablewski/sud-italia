# AI Boardroom — CEO / COO / CFO / CMO Team

A four-agent C-suite that reads Sud Italia's **live** data, flags risks against
restaurant benchmarks, holds real multi-agent meetings, and proposes actions you
approve. Built natively on the platform's existing LLM gateway, tool registry,
approval gate, audit log, and daily budget — not a separate app, and **no mock
data** (CLAUDE.md Rule #1).

Open it at **`/admin-v3/boardroom`** (Intelligence section, manager+).

---

## What it does

| Surface | What you get |
| --- | --- |
| **Overview** | Traffic-light KPI rail (today's sales, food cost %, labour %, prime cost, avg ticket, satisfaction, refund rate, MoM growth), each with a five-section ⓘ explainer; per-agent status cards; quick-action meeting buttons; a "what needs attention" flag list. |
| **Strategy · CEO** | The CEO's owned KPIs + a chat in the CEO's voice (vision, OKRs, menu innovation). |
| **Operations · COO** | The COO's KPIs + chat (kitchen efficiency, staffing, inventory, food safety). |
| **Finance · CFO** | The CFO's KPIs + chat (P&L, food/labour %, pricing, break-even). |
| **Marketing · CMO** | The CMO's KPIs + chat (campaigns, loyalty, reputation, upsell). |
| **Team chat** | A generalist board assistant (all read tools) for cross-functional questions that don't belong to one executive. |
| **Meetings** | Run a **daily briefing** or **weekly review**: COO → CFO → CMO → CEO each speak on the live numbers, then the chair synthesises a **decisions list**. Each decision with a lever has an "Action via {agent}" button that hands it to the owning agent for an approved, audited action. |

### The agents and their tools

Every agent shares read tools and has a curated allowlist (intersected with your
role at call time, so an agent can never widen your permissions):

- **CEO** — P&L, menu engineering, demand forecast, feedback, marketing settings; can propose `update_item_price`.
- **COO** — labour cost, inventory, staff roster, suppliers/POs, menu engineering, demand forecast; can `mark_item_86`.
- **CFO** — P&L, labour cost, menu engineering; can propose `update_item_price`.
- **CMO** — customers, feedback summary, marketing settings; can `send_sms`.

All mutating actions (`update_item_price`, `mark_item_86`, `send_sms`) surface a
**preview card you must approve** before anything changes, and every call is
audit-logged as `actor='claude:<your-user-id>'`.

---

## How to run

1. **Install & start** (standard for this repo):
   ```bash
   npm install
   npm run dev
   ```
2. **Configure the model key.** Copy `.env.local.example` → `.env.local` and set:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   # optional — daily spend cap in grosze (default 100000 = 1000 PLN)
   AI_DAILY_BUDGET_GROSZE=100000
   ```
   Without the key the **KPI dashboard still works** (it reads live data); chat
   and meetings show a "needs-config" state instead of crashing.
3. **(Optional) Postgres.** Set `DATABASE_URL` to persist meetings and chats
   across restarts. Unset = in-memory fallback (fine for local dev). Tables
   self-bootstrap on first use — no migration step.
4. **Open** `/admin-v3/boardroom` as a manager/owner. Pick a location in the top
   bar to scope the location-aware KPIs (food cost %, refund rate, and growth are
   chain-wide by design).
5. **Try it:** click **Run daily briefing**, read the transcript + decisions,
   then **Action via …** a decision to hand it to the owning agent and approve the
   change.

### Where the numbers come from (no mocks)

`get_pnl_snapshot`→`computeSimulationActuals`/`computeSssg`/`getBusinessCosts`,
`get_labor_cost`→`getLaborCostInRange`, `get_menu_engineering`→`computeMenuEngineering`,
`get_inventory_status`→`getIngredientStock`, `get_staff_roster`→`getStaff`/`getShifts`,
`get_suppliers_and_pos`→`getSuppliers`/`getPurchaseOrders`,
`get_feedback_summary`→`getFeedback`, `get_marketing_settings`→`getLoyaltySettings`,
`get_demand_forecast`→`generateDemandForecast`. The KPI engine
(`src/lib/ai/boardroom/kpis.ts`) builds the traffic lights from `getSummary` +
the same store functions.

---

## Extending it

- **New agent or remit** → add a persona to `src/lib/ai/boardroom/personas.ts`
  (system prompt + `toolNames` allowlist + accent), then add a tab in
  `BoardroomV3.tsx`. The agent loop is already persona-aware.
- **New tool** → drop a file in `src/lib/ai/tools/`, `registerTool(...)`, import it
  in `tools/index.ts`, and list its name in the relevant persona allowlist. Wrap a
  real store function — never hardcode data.
- **Connect a real POS / inventory API** → swap the body of the relevant store
  function (`src/lib/store.ts`); every tool and KPI inherits the live source
  automatically because they all read through the store.
- **New KPI** → add it in `kpis.ts` with a benchmark threshold, and add its
  five-section explainer to `boardroom-explainers.ts` (Rule #12 — all five
  sections are required).

---

## Prompt templates

Paste these into a persona tab (talk to one agent) or use them to seed a meeting.
Replace the bracketed bits.

### CEO — Strategy
- `Read today's numbers and set one OKR for the next 30 days with a measurable target and an owner.`
- `We want to grow average ticket without hurting food cost %. What's the menu move, and which item should anchor it?`
- `Compare our momentum (same-store growth) to where we should be. What's the single biggest strategic risk right now?`
- `Should we expand to a third truck this quarter? Make the case from the unit economics, then give me a go/no-go.`

### COO — Operations
- `What's my biggest operational risk for tomorrow's [lunch/dinner] service, and the concrete fix?`
- `Turn this week's demand forecast into a staffing + prep plan for [location].`
- `Which ingredients are at or below reorder point? Draft the priority reorder.`
- `Our refund rate is creeping up — find the likely cause from the data and tell me what to change on the line.`

### CFO — Finance
- `Which menu items are leaking margin? For the worst one, recommend a new price and show the margin before/after.`
- `Break down our prime cost. Is food or labour the bigger problem, and what's the fastest point of improvement?`
- `If food cost stays at [X]% and we do [N] orders/day at [Y] PLN ticket, what's our monthly profit and break-even?`
- `Reprice [item] at [location] to hit a [35]% food-cost target and prepare the change for my approval.`

### CMO — Marketing & Growth
- `Which daypart or weekday is softest, and what campaign would lift it? Predict the impact.`
- `Summarise the last 30 days of feedback — top themes and the one reputation fix that matters most.`
- `Our repeat rate is [flat/falling]. Which loyalty lever should we pull, and how?`
- `Draft a win-back SMS for lapsed regulars at [location] and prepare it for my approval.`

### Whole team — Meetings
Use the **Run daily briefing** / **Run weekly review** buttons. To steer a meeting,
first fix the agenda by acting on the Overview flags, or ask an individual agent to
prep, e.g.:
- `(to CFO) Before the weekly review, give me the margin story in three bullets.`
- `(to COO) Prep the operational risks you'll raise in tomorrow's briefing.`

> Tip: meetings cost a handful of LLM calls (four personas + a synthesis pass) and
> are capped by `AI_DAILY_BUDGET_GROSZE`. The session cost is shown on each meeting.
