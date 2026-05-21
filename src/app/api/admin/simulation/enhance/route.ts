import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { callGateway, extractText, gatewayConfigured } from "@/lib/ai/gateway";
import type {
  SimulationScenario,
} from "@/data/types";

interface SuggestionSnapshot {
  scenario: SimulationScenario;
  /** Pre-computed monthly figures from the page so Claude works with
   *  the same numbers the operator is staring at. All grosze unless noted. */
  computed: {
    monthlyRevenue: number;
    monthlyCogs: number;
    laborMonthly: number;
    fixedTotal: number;
    paymentFees: number;
    /** Optional: post-unit-econ-batch fields. */
    packagingCost?: number;
    marketingCac?: number;
    wasteCost?: number;
    refundLoss?: number;
    loyaltyCost?: number;
    depreciation?: number;
    interest?: number;
    ebitda?: number;
    ebitdar?: number;
    cashOnCashAnnual?: number | null;
    occupancyRatio?: number;
    contributionPerLaborHour?: number;
    trueCm1PerOrderGrosze?: number;
    capacityUtilization?: number;
    totalCost: number;
    netProfit: number;
    margin: number;
    breakEvenOrdersPerDay: number;
    breakEvenOrdersPerMonth: number;
    laborPct: number;
    primeCostPct: number;
    revenuePerLaborHour: number;
    profitPerOrder: number;
    paybackMonths: number | null;
    laborByRole: { role: string; grosze: number }[];
  };
}

interface AiSuggestion {
  category: "revenue" | "cost" | "risk" | "operations";
  severity: "high" | "medium" | "low";
  title: string;
  problem: string;
  recommendation: string;
  /** Monthly profit impact in grosze. Positive = gain, negative = loss avoided / cost incurred. */
  estimatedImpactGrosze?: number;
}

interface AiResponse {
  suggestions?: AiSuggestion[];
}

function parseClaudeJson(text: string): AiResponse | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(candidate) as AiResponse;
  } catch {
    return null;
  }
}

const VALID_CATEGORIES = new Set(["revenue", "cost", "risk", "operations"]);
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);

function sanitiseSuggestion(raw: unknown): AiSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<AiSuggestion>;
  if (!VALID_CATEGORIES.has(r.category as string)) return null;
  if (!VALID_SEVERITIES.has(r.severity as string)) return null;
  if (typeof r.title !== "string" || !r.title.trim()) return null;
  if (typeof r.problem !== "string" || !r.problem.trim()) return null;
  if (typeof r.recommendation !== "string" || !r.recommendation.trim()) return null;
  const impact =
    typeof r.estimatedImpactGrosze === "number" && Number.isFinite(r.estimatedImpactGrosze)
      ? Math.round(r.estimatedImpactGrosze)
      : undefined;
  return {
    category: r.category as AiSuggestion["category"],
    severity: r.severity as AiSuggestion["severity"],
    title: r.title.trim().slice(0, 120),
    problem: r.problem.trim().slice(0, 600),
    recommendation: r.recommendation.trim().slice(0, 800),
    estimatedImpactGrosze: impact,
  };
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    if (!gatewayConfigured()) {
      return NextResponse.json(
        { error: "AI not configured", needsConfig: true },
        { status: 503 },
      );
    }

    let body: SuggestionSnapshot;
    try {
      body = (await req.json()) as SuggestionSnapshot;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body?.scenario || !body?.computed) {
      return NextResponse.json({ error: "Missing scenario or computed snapshot" }, { status: 400 });
    }

    const s = body.scenario;
    const c = body.computed;

    const system =
      "You are a restaurant operations analyst advising a Neapolitan pizza truck " +
      "operator in Warsaw, Poland. The operator has built a what-if monthly P&L " +
      "scenario. Your job is to spot the 4–6 most actionable enhancements to net " +
      "profit, margin, or operational risk — grounded in the actual numbers below. " +
      "Output STRICT JSON with this shape — no prose outside JSON, no markdown fences:\n" +
      `{
  "suggestions": [
    {
      "category": "revenue" | "cost" | "risk" | "operations",
      "severity": "high" | "medium" | "low",
      "title": "short headline, 5–10 words",
      "problem": "1–2 sentences citing actual numbers from the scenario",
      "recommendation": "2–3 sentences with concrete change + reasoning",
      "estimatedImpactGrosze": optional integer monthly impact (positive = profit gain, negative = cost incurred)
    }
  ]
}\n` +
      "Rules:\n" +
      "- Reference real numbers from the input — never invent figures.\n" +
      "- Polish market context: ZUS narzut ~22%, food CPI ~4%, Warsaw pizzeria avg ticket 60–72 zł, " +
      "labor target ≤30% of revenue, prime cost target ≤60–65%.\n" +
      "- Behavior levers that are explicitly disabled (enabled=false) are NOT in the math — suggest " +
      "  turning them ON if the lever would help.\n" +
      "- Don't suggest size/crust upsell — Neapolitan trucks don't do that.\n" +
      "- DO suggest pushing espresso attach when coffeeAttach.attachPct < 0.40: espresso " +
      "  has ~85% pre-leakage gross margin (1.40 zł cost on a 9.90 zł sale), but the actual " +
      "  NET margin landing on the bottom line is ~65-72% after the P&L applies blended " +
      "  payment processor + waste + refunds + loyalty burn (~5-8% combined) and CIT (9% " +
      "  small-CIT or 19% standard). Always quote the lift in zł/mo using NET margin × " +
      "  EFFECTIVE volume (typed ordersPerDay × daysOpenPerMonth × applyAnnualWeather " +
      "  factor — typically ~0.92x for Warsaw seasonality). Don't quote gross-margin " +
      "  monthly numbers; they overstate the actual P&L delta by 15-25% and the operator " +
      "  will notice the gap against the headline net-profit number.\n" +
      "- Flag delivery-only items as margin traps when marketplace share is > 0: a 32 zł " +
      "  Peroni 4-pack with 15 zł cost lands near-zero CM after a 27% Glovo commission. " +
      "  The model now ships a per-channel CM1 panel and a margin-traps callout — refer " +
      "  to those when relevant.\n" +
      "- Flag the marketing CAC when marketingAsCac is on and CAC > 5 zł/order: that's a " +
      "  Y1 acquisition cost that institutional underwriters score against LTV/CAC.\n" +
      "- Don't repeat the same lever in two suggestions.\n" +
      "- Calibrate severity: 'high' = >2 pp margin swing or break-even-risk; 'medium' = clear win " +
      "  but smaller; 'low' = nice-to-have / nuance.\n" +
      "- Prefer specific over generic. 'Drop pizzaiolo hours from 66 to 60/week to save 1 200 zł/mo' " +
      "  beats 'reduce labor costs'.";

    const userText = JSON.stringify(
      {
        currency: "PLN",
        notes:
          "All money fields are in grosze (1 zł = 100 grosze). Output integers in grosze too.",
        revenueInputs: {
          ordersPerDay: s.ordersPerDay,
          avgTicketGrosze: s.avgTicketGrosze,
          daysOpenPerMonth: s.daysOpenPerMonth,
          cogsPct: s.cogsPct,
        },
        labor: s.labor.map((l) => ({
          role: l.role,
          headcount: l.headcount,
          hoursPerWeek: l.hoursPerWeek,
          hourlyRateGrosze: l.hourlyRateGrosze,
        })),
        fixedCosts: s.fixedCosts,
        assumptions: s.assumptions,
        weather: s.weather,
        seasonality: s.seasonality,
        setupCostGrosze: s.setupCostGrosze,
        wageInflationPct: s.wageInflationPct,
        ingredientInflationPct: s.ingredientInflationPct,
        paymentProcessorPct: s.paymentProcessorPct,
        menuScenario: s.menuScenario,
        computed: c,
      },
      null,
      2,
    );

    try {
      const { message } = await callGateway({
        feature: "simulation-enhance",
        system,
        messages: [{ role: "user", content: userText }],
        maxTokens: 2048,
        effort: "high",
        thinking: "adaptive",
      });
      const text = extractText(message);
      const parsed = parseClaudeJson(text);
      const raw = parsed?.suggestions ?? [];
      const cleaned = raw.map(sanitiseSuggestion).filter((s): s is AiSuggestion => s !== null);
      return NextResponse.json({
        suggestions: cleaned,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: "AI call failed",
          detail: err instanceof Error ? err.message : "unknown",
        },
        { status: 502 },
      );
    }
  },
);
