import type { ExplainerProps } from "./ui";

/**
 * Five-section explainers (CLAUDE.md Rule #12) for every Boardroom KPI.
 * Each entry supplies all five required parts — description, INSTITUTIONAL
 * ANALYSIS, IN PLAIN TERMS, TIPS, METHODOLOGY — rendered in the fixed
 * order by MetricExplainer/InfoButton. Keyed by the KPI id returned from
 * /api/admin/ai/boardroom/overview.
 */
export const KPI_EXPLAINERS: Record<string, ExplainerProps> = {
  "today-revenue": {
    description: "Total sales booked at this scope so far today, across all channels.",
    institutional:
      "Intraday revenue is the board's pulse check, not a verdict — judge it against the same weekday's run-rate, not yesterday. Analysts pace it: by 14:00 a lunch-led restaurant should have ~45–55% of its daily take in. A flat morning is recoverable; a flat evening is a lost day.",
    plain:
      "It's the till total since midnight. If you've rung up 3 200 PLN by mid-afternoon and a normal Tuesday does 7 000 PLN, you're on pace — the dinner rush does the rest.",
    tips:
      "Pull the slow daypart forward with a limited-time bundle or an SMS to lapsed regulars (CMO). Make sure the line is staffed and prepped before the rush (COO). Push a high-margin add-on at the till (CFO).",
    methodology:
      "Σ order totals (grosze) for orders created today at the selected scope, via getSummary(location, today, today). Excludes cancelled orders. Shown in PLN.",
  },
  "food-cost": {
    description: "Cost of ingredients as a share of revenue over the trailing 30 days.",
    institutional:
      "Food cost % is half of prime cost and the first place margin leaks. The institutional gate is 28–32%; 33–35% is a yellow warning; above 35% is red and usually means portioning drift, waste, theft, or under-pricing. A single point of food cost on a 200k PLN/month site is ~2 000 PLN/month of profit.",
    plain:
      "For every 100 PLN you take, this is how much went into the dough, cheese and toppings. At 30% a 27.90 PLN Margherita costs you ~8.40 PLN to make — healthy. At 38% the kitchen is quietly eating your profit.",
    tips:
      "Re-cost recipes against current supplier prices and renegotiate the worst lines (CFO). Tighten portioning and cut waste on perishables (COO). Reprice or re-engineer plowhorse items that sell well but earn little (CFO/CEO via update_item_price).",
    methodology:
      "Σ line-item cost ÷ Σ revenue across fulfilled orders in the last 30 days at the selected scope (getSummary totalCost ÷ totalRevenue). Green ≤32%, yellow ≤35%, red >35%.",
  },
  "labor-cost": {
    description: "Paid labour as a share of revenue over the trailing 7 days.",
    institutional:
      "Labour % is the other half of prime cost and the most controllable in real time. The gate is 25–30%; above 35% is red. Unlike food cost it's a staffing decision: over-scheduling a slow shift burns it instantly. Pair it with sales-per-labour-hour to see whether you're under- or over-staffed.",
    plain:
      "Out of every 100 PLN, this is what went to wages (fully loaded). Roster four people through a dead Monday lunch and this spikes; match the rota to the forecast and it falls without hurting service.",
    tips:
      "Re-roster against the demand forecast — cut the over-covered dayparts (COO). Cross-train so one fewer body covers the lull (COO). Lift average ticket so the same hours earn more (CFO/CMO).",
    methodology:
      "Paired clock-in/out cost × hourly rate ÷ revenue over the last 7 days (getLaborCostInRange ÷ getSummary revenue). Green ≤30%, yellow ≤35%, red >35%.",
  },
  "prime-cost": {
    description: "Food cost % plus labour cost % — the two biggest controllable costs combined.",
    institutional:
      "Prime cost is the single number operators live by because rent and overhead are largely fixed. The institutional gate is <60% of revenue; 55% is excellent; above 65% the model rarely clears a profit after fixed costs. It's the fastest read on whether the unit economics work.",
    plain:
      "Add what you spend on ingredients and on people. If together they're under 60 PLN of every 100 PLN, there's room left for rent and profit. Over 65 and you're working for the landlord.",
    tips:
      "Attack whichever half is worse first (CFO). Small wins compound — one point of food and one of labour is two points of prime. Protect it during growth: don't let new hires outrun new sales (CEO).",
    methodology:
      "food-cost% + labour-cost% at the selected scope. Green ≤60%, yellow ≤65%, red >65%.",
  },
  "avg-ticket": {
    description: "Average value of an order (today if there are orders, else the 30-day average).",
    institutional:
      "Average ticket is the lever that lifts revenue without new customers. The CFO cares whether growth is price/mix-led (durable) or just inflation. A rising ticket alongside flat food cost % is the healthiest growth pattern there is.",
    plain:
      "What a typical order is worth. Nudging it from 48 to 53 PLN across 120 orders a day is +600 PLN/day — roughly +18 000 PLN/month with no extra footfall.",
    tips:
      "Add a coffee + dessert prompt to every pizza/pasta order (CMO/CFO). Build a clear bundle ladder so the default choice is the bigger one (CFO). Anchor with a premium item so mid-tier looks like value (CEO).",
    methodology:
      "Revenue ÷ order count — today's value when orders exist (getSummary avgOrderValue), otherwise the 30-day actuals average ticket (computeSimulationActuals). Shown in PLN.",
  },
  satisfaction: {
    description: "Average customer rating from feedback over the trailing 30 days.",
    institutional:
      "Satisfaction is the leading indicator the CMO watches because reputation drives acquisition and retention before it shows up in revenue. The gate is ≥4.3★; 4.0–4.3 is a yellow watch; below 4.0 reputation is actively bleeding. Read it with review volume — a 4.8 on three reviews isn't a signal.",
    plain:
      "The stars guests give you. Drop from 4.5 to 3.9 and the next would-be customer scrolling Google quietly picks the pizzeria down the street.",
    tips:
      "Triage the recent negative themes the CMO surfaces and fix the top one (COO). Respond to every bad review publicly and win the customer back (CMO). Close the loop with an SMS apology + comeback offer (CMO via send_sms).",
    methodology:
      "Mean overallRating across feedback at the scope in the last 30 days (getFeedback). Green ≥4.3, yellow ≥4.0, red <4.0; neutral when there are no reviews.",
  },
  "refund-rate": {
    description: "Share of orders refunded or cancelled over the trailing 30 days (chain-wide).",
    institutional:
      "Refund/cancel rate is a quality-and-execution canary. Under 3% is healthy; 3–5% warrants a look; above 5% points to systemic problems — wrong orders, long waits, or item availability. Every refund is lost revenue plus the cost already sunk into the food.",
    plain:
      "Out of 100 orders, how many you had to give the money back on. Three is normal life. Eight means something on the line is consistently going wrong and it's costing you twice — the sale and the ingredients.",
    tips:
      "Trace refund reasons and fix the top driver — speed, accuracy, or stockouts (COO). 86 items early rather than disappoint mid-order (COO via mark_item_86). Tighten the delivery hand-off so food arrives hot (COO).",
    methodology:
      "Refunded/cancelled orders ÷ total orders over 30 days, chain-wide (computeSimulationActuals refundPct). Green <3%, yellow <5%, red ≥5%.",
  },
  "revenue-growth": {
    description: "Same-store revenue change vs the prior 30-day window (chain-wide).",
    institutional:
      "Same-store sales growth (SSSG) strips out new-site noise and tells the CEO whether the existing business is actually expanding. Positive growth is the gate; flat-to-negative on a young chain is a strategy alarm. Decompose it: volume-led (more orders) vs ticket-led (bigger orders) vs acquisition-led (more customers).",
    plain:
      "Are this month's existing trucks selling more than last month's? +8% means the machine is compounding. −5% means demand is slipping and a campaign or menu move is overdue.",
    tips:
      "If it's volume that's soft, the CMO runs acquisition + win-back; if it's ticket, the CFO works bundles and pricing (CEO sets the priority). Protect the loyalty loop so repeat rate holds. Set a measurable SSSG OKR and review it weekly.",
    methodology:
      "(current 30d revenue − prior 30d revenue) ÷ prior, chain-wide (computeSssg revenueGrowthPct). Green >+5%, yellow ≥−5%, red <−5%.",
  },
};
