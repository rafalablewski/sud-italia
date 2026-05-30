"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Coins, TrendingUp, Boxes, FlaskConical } from "lucide-react";
import { Button, Card, CardBody, Input, Select, Badge, type BadgeTone } from "./v2/ui";
import { PlainTalk, Methodology, Tips } from "./Explainers";
import { KpiCard } from "./v2/charts";
import { formatPrice } from "@/lib/utils";
import type { SimulationMenuEngineeringLine } from "@/data/types";

type Quadrant = SimulationMenuEngineeringLine["quadrant"];

const QUADRANT_TONE: Record<Quadrant, BadgeTone> = {
  star: "success",
  puzzle: "info",
  plowhorse: "warning",
  dog: "danger",
};
const QUADRANT_LABEL: Record<Quadrant, string> = {
  star: "Star",
  puzzle: "Puzzle",
  plowhorse: "Plowhorse",
  dog: "Dog",
};

const TARGET_OPTIONS = [
  { value: "all", label: "All dishes" },
  { value: "star", label: "Stars only" },
  { value: "plowhorse", label: "Plowhorses only" },
  { value: "puzzle", label: "Puzzles only" },
  { value: "dog", label: "Dogs only" },
];

/** Build a fully-typed example line from the few fields the sandbox uses. */
function ex(
  id: string,
  name: string,
  category: string,
  quadrant: Quadrant,
  units: number,
  priceG: number,
  costG: number,
): SimulationMenuEngineeringLine {
  const gpPerUnit = priceG - costG;
  return {
    menuItemId: id,
    name,
    category,
    unitsSold: units,
    gpPerUnit,
    revenue: units * priceG,
    cost: units * costG,
    quadrant,
    deliveryOnly: false,
    prepTimeMinutes: 8,
    trueCm1PerUnit: Math.round(gpPerUnit * 0.82),
    marginTrap: false,
    prepHeavy: false,
    spoilageRisk: false,
  };
}

/** Worked Sud Italia menu example (90-day window) — used when no dishes
 *  have sold yet so the sandbox is never empty. */
const EXAMPLE_MENU: SimulationMenuEngineeringLine[] = [
  ex("ex-margherita", "Pizza Margherita", "pizza", "star", 2400, 3200, 950),
  ex("ex-diavola", "Pizza Diavola", "pizza", "star", 1500, 3800, 1250),
  ex("ex-tiramisu", "Tiramisù", "dolci", "star", 1300, 1900, 520),
  ex("ex-espresso", "Espresso", "caffe", "plowhorse", 2100, 800, 150),
  ex("ex-patatine", "Patatine fritte", "contorni", "plowhorse", 1400, 1500, 480),
  ex("ex-bufala", "Pizza Bufala", "pizza", "puzzle", 620, 4400, 1750),
  ex("ex-aperol", "Aperol Spritz", "bevande", "puzzle", 780, 2400, 620),
  ex("ex-marinara", "Pizza Marinara", "pizza", "puzzle", 540, 2900, 700),
  ex("ex-burrata", "Burrata starter", "antipasti", "dog", 240, 3600, 2050),
  ex("ex-calzone", "Calzone", "pizza", "dog", 300, 4000, 1500),
];

const WINDOW_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
];

/**
 * Menu-engineering what-if sandbox — embedded at the bottom of the menu
 * engineering matrix. Self-gates on `menuEngineeringSimulationEnabled`,
 * seeds from the live matrix and falls back to a worked Sud Italia menu
 * when nothing has sold yet.
 */
export function MenuEngineeringSandbox() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [windowDays, setWindowDays] = useState("90");
  const [items, setItems] = useState<SimulationMenuEngineeringLine[] | null>(null);

  const [target, setTarget] = useState("all");
  const [priceChangePct, setPriceChangePct] = useState(0);
  const [elasticity, setElasticity] = useState(0.5);
  const [promotePuzzlesPct, setPromotePuzzlesPct] = useState(0);
  const [removeDogs, setRemoveDogs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && setEnabled(!!j?.menuEngineeringSimulationEnabled))
      .catch(() => !cancelled && setEnabled(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/menu-engineering?days=${windowDays}`).then((r) =>
      r.ok ? r.json() : null,
    );
    setItems(res?.items ?? null);
  }, [windowDays]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const usingExample = !items || items.length === 0;
  const source = usingExample ? EXAMPLE_MENU : items;

  const rows = useMemo(() => {
    return source.map((it) => {
      const unitPrice = it.unitsSold > 0 ? it.revenue / it.unitsSold : 0;
      const unitCost = it.unitsSold > 0 ? it.cost / it.unitsSold : 0;
      const baseGp = it.revenue - it.cost;

      const inTarget = target === "all" || it.quadrant === target;
      const priceMult = inTarget ? 1 + priceChangePct / 100 : 1;
      let demandMult = inTarget && priceMult > 0 ? Math.pow(priceMult, -elasticity) : 1;
      if (it.quadrant === "puzzle") demandMult *= 1 + promotePuzzlesPct / 100;
      const removed = removeDogs && it.quadrant === "dog";

      const simUnits = removed ? 0 : it.unitsSold * demandMult;
      const simUnitPrice = unitPrice * priceMult;
      const simRevenue = simUnits * simUnitPrice;
      const simCost = simUnits * unitCost;
      const simGp = simRevenue - simCost;

      return {
        id: it.menuItemId,
        name: it.name,
        quadrant: it.quadrant,
        baseUnits: it.unitsSold,
        simUnits,
        baseRevenue: it.revenue,
        simRevenue,
        baseGp,
        simGp,
        gpDelta: simGp - baseGp,
        removed,
      };
    });
  }, [source, target, priceChangePct, elasticity, promotePuzzlesPct, removeDogs]);

  const totals = useMemo(() => {
    const baseGp = rows.reduce((s, r) => s + r.baseGp, 0);
    const simGp = rows.reduce((s, r) => s + r.simGp, 0);
    const baseRevenue = rows.reduce((s, r) => s + r.baseRevenue, 0);
    const simRevenue = rows.reduce((s, r) => s + r.simRevenue, 0);
    const baseUnits = rows.reduce((s, r) => s + r.baseUnits, 0);
    const simUnits = rows.reduce((s, r) => s + r.simUnits, 0);
    return { baseGp, simGp, baseRevenue, simRevenue, baseUnits, simUnits };
  }, [rows]);

  const movers = useMemo(
    () => [...rows].sort((a, b) => Math.abs(b.gpDelta) - Math.abs(a.gpDelta)).slice(0, 12),
    [rows],
  );

  const resetLevers = () => {
    setTarget("all");
    setPriceChangePct(0);
    setElasticity(0.5);
    setPromotePuzzlesPct(0);
    setRemoveDogs(false);
  };

  if (!enabled) return null;

  const gpDelta = totals.simGp - totals.baseGp;
  const gpDeltaPct = totals.baseGp > 0 ? (gpDelta / totals.baseGp) * 100 : 0;
  const revDelta = totals.simRevenue - totals.baseRevenue;
  const unitsDelta = totals.simUnits - totals.baseUnits;

  return (
    <div className="v2-stack-16" style={{ marginTop: 8 }}>
      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <FlaskConical className="h-4 w-4" aria-hidden /> What-if sandbox
              {usingExample && <Badge tone="warning">Example data</Badge>}
            </h2>
            <div style={{ display: "inline-flex", gap: 8 }}>
              <Select aria-label="Window" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} options={WINDOW_OPTIONS} />
              <Button variant="ghost" size="sm" leadingIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetLevers}>
                Reset levers
              </Button>
            </div>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)" }}>
            {usingExample
              ? "No sales in this window — these levers run on a worked Sud Italia menu (10 dishes). Once dishes sell it seeds from your own velocity and margin automatically."
              : "Re-price, re-promote or cut dishes to project the contribution-margin impact before you touch the live menu."}
          </p>

          <div className="v2-detail-grid" style={{ marginTop: 14 }}>
            <Select label="Apply price change to" value={target} onChange={(e) => setTarget(e.target.value)} options={TARGET_OPTIONS} />
            <Input
              type="number"
              label="Price change (%)"
              value={priceChangePct}
              step={1}
              onChange={(e) => setPriceChangePct(Number(e.target.value) || 0)}
              description="Up = more margin per unit but fewer units; down = the reverse."
            />
            <Input
              type="number"
              label="Demand elasticity"
              value={elasticity}
              step={0.1}
              min={0}
              max={3}
              onChange={(e) => setElasticity(Math.max(0, Number(e.target.value) || 0))}
              description="Units lost per 1% price rise. Food ≈ 0.5 (inelastic); 0 = no demand response."
            />
            <Input
              type="number"
              label="Promote puzzles (% velocity)"
              value={promotePuzzlesPct}
              step={1}
              min={0}
              onChange={(e) => setPromotePuzzlesPct(Math.max(0, Number(e.target.value) || 0))}
              description="Marketing lift on high-margin, low-velocity dishes."
            />
            <label className="v2-field">
              <span className="v2-field-label">Remove dogs</span>
              <span className="inline-flex items-center gap-2 mt-1">
                <input type="checkbox" checked={removeDogs} onChange={(e) => setRemoveDogs(e.target.checked)} />
                <span className="v2-muted text-sm">Drop low-volume, low-margin dishes from the projection.</span>
              </span>
            </label>
          </div>
        </CardBody>
      </Card>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Projected contribution"
          value={totals.simGp}
          display={formatPrice(Math.round(totals.simGp))}
          icon={Coins}
          tone={gpDelta > 0 ? "success" : gpDelta < 0 ? "danger" : "neutral"}
          hint={`baseline ${formatPrice(Math.round(totals.baseGp))} · ${gpDelta >= 0 ? "+" : ""}${gpDeltaPct.toFixed(1)}%`}
        />
        <KpiCard
          label="Δ contribution"
          value={gpDelta}
          display={`${gpDelta >= 0 ? "+" : ""}${formatPrice(Math.round(gpDelta))}`}
          icon={TrendingUp}
          tone={gpDelta > 0 ? "success" : gpDelta < 0 ? "danger" : "neutral"}
          hint="vs the baseline window"
        />
        <KpiCard
          label="Projected revenue"
          value={totals.simRevenue}
          display={formatPrice(Math.round(totals.simRevenue))}
          icon={Coins}
          tone={revDelta > 0 ? "success" : revDelta < 0 ? "danger" : "neutral"}
          hint={`baseline ${formatPrice(Math.round(totals.baseRevenue))}`}
        />
        <KpiCard
          label="Projected units"
          value={totals.simUnits}
          display={Math.round(totals.simUnits).toLocaleString("pl-PL")}
          icon={Boxes}
          tone={unitsDelta > 0 ? "success" : unitsDelta < 0 ? "danger" : "neutral"}
          hint={`baseline ${Math.round(totals.baseUnits).toLocaleString("pl-PL")}`}
        />
      </section>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Biggest movers</h2>
            <span className="v2-detail-head-hint">Dishes whose projected contribution shifts most under your levers</span>
          </div>
          <div className="v2-cohort-table-wrap">
            <table className="v2-cohort-table">
              <thead>
                <tr>
                  <th className="v2-cohort-th-cohort">Dish</th>
                  <th className="v2-cohort-th-cohort">Quadrant</th>
                  <th className="v2-cohort-th-num">Units (base → sim)</th>
                  <th className="v2-cohort-th-num">Contribution (base → sim)</th>
                  <th className="v2-cohort-th-num">Δ</th>
                </tr>
              </thead>
              <tbody>
                {movers.map((r) => (
                  <tr key={r.id} style={r.removed ? { opacity: 0.55 } : undefined}>
                    <td className="v2-cohort-td-cohort">
                      {r.name}
                      {r.removed && <span className="v2-muted"> · removed</span>}
                    </td>
                    <td className="v2-cohort-td-cohort">
                      <Badge tone={QUADRANT_TONE[r.quadrant]}>{QUADRANT_LABEL[r.quadrant]}</Badge>
                    </td>
                    <td className="v2-cohort-td-num tabular">
                      {Math.round(r.baseUnits).toLocaleString("pl-PL")} → {Math.round(r.simUnits).toLocaleString("pl-PL")}
                    </td>
                    <td className="v2-cohort-td-num tabular">
                      {formatPrice(Math.round(r.baseGp))} → {formatPrice(Math.round(r.simGp))}
                    </td>
                    <td
                      className="v2-cohort-td-num v2-cohort-td-headline tabular"
                      style={{ color: r.gpDelta > 0 ? "var(--success, #28a06d)" : r.gpDelta < 0 ? "var(--danger, #e5484d)" : undefined }}
                    >
                      {r.gpDelta >= 0 ? "+" : ""}{formatPrice(Math.round(r.gpDelta))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>How this projects</h2>
            <span className="v2-detail-head-hint">Real seed, transparent math</span>
          </div>
          <PlainTalk>
            <p style={{ margin: 0 }}>
              Every dish has a real price, cost and how many you sold. Raise a price and you make
              more on each one — but sell a few fewer. Promote a high-margin &ldquo;puzzle&rdquo; and
              you sell more of your best earners. This adds it all up so you can see whether a menu
              change <em>grows total profit</em> before you commit.
            </p>
          </PlainTalk>
          <Methodology>
            <p style={{ margin: 0 }}>
              Per-unit price/cost are recovered from each item&apos;s revenue ÷ units. A price change
              multiplies unit price and applies a demand response of <code>(1 + Δprice)^(−elasticity)</code>;
              promoting puzzles multiplies their velocity; removing dogs zeroes their units.
              Contribution = projected revenue − cost, summed across the menu.
            </p>
          </Methodology>
          <Tips>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Reprice plowhorses up.</strong> High-volume, low-margin dishes give small per-unit gains × big volume.</li>
              <li><strong>Promote puzzles, don&apos;t discount them.</strong> They already carry margin; they just need velocity.</li>
            </ul>
          </Tips>
        </CardBody>
      </Card>
    </div>
  );
}
