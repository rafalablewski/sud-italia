import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getSimulationScenario,
  saveSimulationScenario,
  seedSimulationFromHistory,
} from "@/lib/store";
import type { SimulationLaborLine, SimulationScenario } from "@/data/types";

const VALID_ROLES = new Set([
  "pizzaiolo",
  "chef",
  "sous-chef",
  "kitchen-porter",
  "waiter",
  "barista",
  "driver",
  "manager",
  "cleaner",
  "other",
]);

const VALID_CATEGORIES = new Set([
  "payroll",
  "rent",
  "utilities",
  "insurance",
  "fuel",
  "vehicle",
  "maintenance",
  "licenses",
  "marketing",
  "ingredients",
  "equipment",
  "software",
  "professional",
  "tax",
  "other",
]);

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    if (req.nextUrl.searchParams.get("seed") === "1") {
      return NextResponse.json(await seedSimulationFromHistory());
    }
    return NextResponse.json(await getSimulationScenario());
  },
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const b = body as Partial<SimulationScenario>;
    if (
      typeof b.ordersPerDay !== "number" ||
      typeof b.avgTicketGrosze !== "number" ||
      typeof b.daysOpenPerMonth !== "number" ||
      typeof b.cogsPct !== "number" ||
      !Array.isArray(b.labor) ||
      !b.fixedCosts ||
      typeof b.fixedCosts !== "object"
    ) {
      return NextResponse.json({ error: "Invalid scenario shape" }, { status: 400 });
    }
    for (const line of b.labor as SimulationLaborLine[]) {
      if (
        !line ||
        typeof line.id !== "string" ||
        !VALID_ROLES.has(line.role) ||
        typeof line.headcount !== "number" ||
        typeof line.hoursPerWeek !== "number" ||
        typeof line.hourlyRateGrosze !== "number"
      ) {
        return NextResponse.json({ error: "Invalid labor line" }, { status: 400 });
      }
    }
    for (const key of Object.keys(b.fixedCosts)) {
      if (!VALID_CATEGORIES.has(key)) {
        return NextResponse.json({ error: `Invalid cost category: ${key}` }, { status: 400 });
      }
    }
    const scenario: SimulationScenario = {
      ordersPerDay: b.ordersPerDay,
      avgTicketGrosze: b.avgTicketGrosze,
      daysOpenPerMonth: b.daysOpenPerMonth,
      cogsPct: b.cogsPct,
      labor: b.labor as SimulationLaborLine[],
      fixedCosts: b.fixedCosts as SimulationScenario["fixedCosts"],
      wageInflationPct: typeof b.wageInflationPct === "number" ? b.wageInflationPct : undefined,
      ingredientInflationPct:
        typeof b.ingredientInflationPct === "number" ? b.ingredientInflationPct : undefined,
      paymentProcessorPct:
        typeof b.paymentProcessorPct === "number" ? b.paymentProcessorPct : undefined,
      setupCostGrosze: typeof b.setupCostGrosze === "number" ? b.setupCostGrosze : undefined,
      seasonality: b.seasonality,
      menuScenario: typeof b.menuScenario === "string" ? b.menuScenario : undefined,
      assumptions: b.assumptions,
      weather: b.weather,
      updatedAt: new Date().toISOString(),
    };
    const saved = await saveSimulationScenario(scenario);
    await appendAuditLog({
      actor: user.email || user.id,
      action: "simulation.update",
      entityType: "simulation",
      after: { ordersPerDay: saved.ordersPerDay, avgTicketGrosze: saved.avgTicketGrosze },
    });
    return NextResponse.json(saved);
  },
);
