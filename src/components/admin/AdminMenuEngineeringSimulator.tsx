"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, UtensilsCrossed, Coins, TrendingUp, Boxes } from "lucide-react";
import { Button, Card, CardBody, EmptyState, Input, Select, Badge, type BadgeTone } from "./v2/ui";
import { PlainTalk, Methodology, Tips } from "./Explainers";
import { KpiCard } from "./v2/charts";
import { formatPrice } from "@/lib/utils";
import type { SimulationMenuEngineeringLine } from "@/data/types";

type Quadrant = SimulationMenuEngineeringLine["quadrant"];

interface ApiResponse {
  windowDays: number;
  location: string;
  items: SimulationMenuEngineeringLine[];
}

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

const WINDOW_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
];

export function AdminMenuEngineeringSimulator() {
  const [windowDays, setWindowDays] = useState("90");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Levers.
  const [target, setTarget] = useState("all");
  const [priceChangePct, setPriceChangePct] = useState(0);
  const [elasticity, setElasticity] = useState(0.5);
  const [promotePuzzlesPct, setPromotePuzzlesPct] = useState(0);
  const [removeDogs, setRemoveDogs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/menu-engineering?days=${windowDays}`).then((r) =>
        r.ok ? r.json() : null,
      );
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    return items.map((it) => {
      const unitPrice = it.unitsSold > 0 ? it.revenue / it.unitsSold : 0;
      const unitCost = it.unitsSold > 0 ? it.cost / it.unitsSold : 0;
      const baseGp = it.revenue - it.cost;

      const inTarget = target === "all" || it.quadrant === target;
      const priceMult = inTarget ? 1 + priceChangePct / 100 : 1;
      // Price elasticity of demand: a 10% price rise at e=0.5 sheds ~5% of
      // units. Food is typically inelastic (e < 1).
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
  }, [data, target, priceChangePct, elasticity, promotePuzzlesPct, removeDogs]);

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

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading menu engineering simulator…</div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <div className="v2-page-title-row">
            <h1 className="v2-page-title">Menu engineering simulator</h1>
            <p className="v2-page-subtitle">No sales in this window — nothing to re-engineer.</p>
          </div>
        </header>
        <Card>
          <CardBody>
            <EmptyState
              icon={UtensilsCrossed}
              title="No data to seed"
              description="Once dishes sell, this seeds each item's real velocity and margin, then re-prices and re-promotes them to project the contribution-margin impact."
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  const gpDelta = totals.simGp - totals.baseGp;
  const gpDeltaPct = totals.baseGp > 0 ? (gpDelta / totals.baseGp) * 100 : 0;
  const revDelta = totals.simRevenue - totals.baseRevenue;
  const unitsDelta = totals.simUnits - totals.baseUnits;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Menu engineering simulator</h1>
          <p className="v2-page-subtitle">
            Seeded from the real{" "}
            <Link href="/admin/menu-engineering" className="v2-link">Kasavana-Smith matrix</Link>{" "}
            over the last {data.windowDays} days. Re-price, re-promote or cut dishes to project the
            contribution-margin impact before you touch the live menu.
          </p>
        </div>
        <div className="v2-page-actions">
          <Select
            aria-label="Window"
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
            options={WINDOW_OPTIONS}
          />
          <Button variant="ghost" size="sm" leadingIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetLevers}>
            Reset levers
          </Button>
        </div>
      </header>

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
          hint="vs the real baseline window"
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
            <h2>What-if levers</h2>
            <span className="v2-detail-head-hint">Price moves carry a demand response; defaults leave the menu untouched</span>
          </div>
          <div className="v2-detail-grid" style={{ marginTop: 12 }}>
            <Select
              label="Apply price change to"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              options={TARGET_OPTIONS}
            />
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
                <span className="v2-muted text-sm">
                  Drop low-volume, low-margin dishes from the projection.
                </span>
              </span>
            </label>
          </div>
        </CardBody>
      </Card>

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
              Every dish has a real selling price, cost and how many you actually sold. Raise a
              price and you make more on each one — but sell a few fewer. Promote a high-margin
              &ldquo;puzzle&rdquo; and you sell more of your best earners. This adds it all up so you
              can see whether a menu change <em>grows total profit</em> before you commit to it.
            </p>
          </PlainTalk>
          <Methodology>
            <p style={{ margin: 0 }}>
              Per-unit price and cost are recovered from each item&apos;s real revenue ÷ units and
              cost ÷ units. A price change multiplies the unit price and applies a demand response
              of <code>(1 + Δprice)^(−elasticity)</code>; promoting puzzles multiplies their
              velocity; removing dogs zeroes their units. Contribution = projected revenue −
              projected cost, summed across the menu. Quadrant labels are the seed&apos;s real
              Kasavana-Smith classification.
            </p>
          </Methodology>
          <Tips>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Reprice plowhorses up.</strong> High-volume, low-margin dishes are the best repricing candidates — small per-unit gains × big volume.</li>
              <li><strong>Promote puzzles, don&apos;t discount them.</strong> They already carry margin; they just need velocity.</li>
              <li><strong>Don&apos;t blanket-cut dogs</strong> tagged as anchors — premium decoys earn their menu slot by making everything else look reasonable.</li>
            </ul>
          </Tips>
        </CardBody>
      </Card>
    </div>
  );
}
