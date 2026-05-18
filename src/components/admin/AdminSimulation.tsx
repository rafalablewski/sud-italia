"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Calculator,
  ChefHat,
  Database,
  FlaskConical,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type {
  BusinessCostCategory,
  BusinessCostPayrollRole,
  SimulationLaborLine,
  SimulationScenario,
} from "@/data/types";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Input,
  Select,
} from "./v2/ui";
import { KpiCard, PieChart } from "./v2/charts";

const PAYROLL_ROLE_LABEL: Record<BusinessCostPayrollRole, string> = {
  pizzaiolo: "Pizzaiolo",
  chef: "Chef (pasta)",
  "sous-chef": "Sous-chef",
  "kitchen-porter": "Kitchen porter",
  waiter: "Waiter / front of house",
  barista: "Barista",
  driver: "Driver",
  manager: "Manager",
  cleaner: "Cleaner",
  other: "Other",
};

const FIXED_COST_FIELDS: { key: BusinessCostCategory; label: string }[] = [
  { key: "rent", label: "Rent & lease" },
  { key: "utilities", label: "Utilities" },
  { key: "fuel", label: "Fuel" },
  { key: "vehicle", label: "Vehicle" },
  { key: "insurance", label: "Insurance" },
  { key: "licenses", label: "Licenses & permits" },
  { key: "marketing", label: "Marketing" },
  { key: "software", label: "Software & SaaS" },
  { key: "professional", label: "Professional services" },
  { key: "tax", label: "Tax & fees" },
  { key: "maintenance", label: "Maintenance" },
  { key: "equipment", label: "Equipment" },
  { key: "other", label: "Other" },
];

const WEEKS_PER_MONTH = 4.345;

interface Computed {
  monthlyRevenue: number;
  monthlyCogs: number;
  laborMonthly: number;
  fixedTotal: number;
  totalCost: number;
  netProfit: number;
  margin: number;
  breakEvenOrdersPerDay: number;
  laborByRole: { role: BusinessCostPayrollRole; grosze: number }[];
}

function computeScenario(s: SimulationScenario): Computed {
  const monthlyRevenue = s.ordersPerDay * s.avgTicketGrosze * s.daysOpenPerMonth;
  const monthlyCogs = Math.round(monthlyRevenue * s.cogsPct);
  const laborByRole: { role: BusinessCostPayrollRole; grosze: number }[] = s.labor.map((l) => ({
    role: l.role,
    grosze: Math.round(l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze),
  }));
  const laborMonthly = laborByRole.reduce((sum, r) => sum + r.grosze, 0);
  const fixedTotal = Object.values(s.fixedCosts).reduce(
    (sum: number, v) => sum + (v ?? 0),
    0,
  );
  const totalCost = monthlyCogs + laborMonthly + fixedTotal;
  const netProfit = monthlyRevenue - totalCost;
  const margin = monthlyRevenue > 0 ? netProfit / monthlyRevenue : 0;
  // Break-even: contribution per order = avgTicket × (1 − cogsPct). Need to
  // cover (labor + fixed) each month. Divide by daysOpen for daily rate.
  const contributionPerOrder = s.avgTicketGrosze * (1 - s.cogsPct);
  const breakEvenOrdersPerMonth =
    contributionPerOrder > 0 ? (laborMonthly + fixedTotal) / contributionPerOrder : 0;
  const breakEvenOrdersPerDay =
    s.daysOpenPerMonth > 0 ? breakEvenOrdersPerMonth / s.daysOpenPerMonth : 0;
  return {
    monthlyRevenue,
    monthlyCogs,
    laborMonthly,
    fixedTotal,
    totalCost,
    netProfit,
    margin,
    breakEvenOrdersPerDay,
    laborByRole,
  };
}

export function AdminSimulation() {
  const toast = useToast();
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchScenario = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/simulation");
      if (res.ok) {
        const data = (await res.json()) as SimulationScenario;
        setScenario(data);
        dirtyRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScenario();
  }, [fetchScenario]);

  const persist = useCallback(
    async (next: SimulationScenario, opts?: { quiet?: boolean }) => {
      setSaving(true);
      try {
        const res = await fetch("/api/admin/simulation", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (res.ok) {
          dirtyRef.current = false;
          if (!opts?.quiet) toast.success("Scenario saved");
        } else if (!opts?.quiet) {
          toast.error("Could not save scenario");
        }
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  // Debounced auto-save on edits — 1 s after the last keystroke.
  const update = useCallback(
    (mut: (prev: SimulationScenario) => SimulationScenario) => {
      setScenario((prev) => {
        if (!prev) return prev;
        const next = mut(prev);
        dirtyRef.current = true;
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(() => {
          if (dirtyRef.current) persist(next, { quiet: true });
        }, 1000);
        return next;
      });
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const computed = useMemo(
    () => (scenario ? computeScenario(scenario) : null),
    [scenario],
  );

  if (loading || !scenario || !computed) {
    return <div className="v2-page-loading">Loading simulation…</div>;
  }

  const seedFromHistory = async () => {
    setSeedConfirmOpen(false);
    const res = await fetch("/api/admin/simulation?seed=1");
    if (!res.ok) {
      toast.error("Could not seed from history");
      return;
    }
    const seeded = (await res.json()) as SimulationScenario;
    setScenario(seeded);
    await persist(seeded);
    toast.success("Seeded from the last 30 days");
  };

  const resetToDefaults = async () => {
    setResetConfirmOpen(false);
    // Mirrors defaultSimulationScenario() in src/lib/store.ts — Warsaw
    // 2026 brutto × 1.22 narzut, food-truck pitch fees, 30% COGS.
    const defaults: SimulationScenario = {
      ordersPerDay: 70,
      avgTicketGrosze: 6500,
      daysOpenPerMonth: 28,
      cogsPct: 0.3,
      labor: [
        { id: "pizzaiolo", role: "pizzaiolo", headcount: 2, hoursPerWeek: 66, hourlyRateGrosze: 4300 },
        { id: "chef", role: "chef", headcount: 1, hoursPerWeek: 66, hourlyRateGrosze: 3700 },
        { id: "sous-chef", role: "sous-chef", headcount: 1, hoursPerWeek: 48, hourlyRateGrosze: 3300 },
        { id: "barista", role: "barista", headcount: 1, hoursPerWeek: 60, hourlyRateGrosze: 3900 },
        { id: "waiter", role: "waiter", headcount: 2, hoursPerWeek: 60, hourlyRateGrosze: 4000 },
        { id: "kitchen-porter", role: "kitchen-porter", headcount: 1, hoursPerWeek: 36, hourlyRateGrosze: 3000 },
        { id: "manager", role: "manager", headcount: 1, hoursPerWeek: 50, hourlyRateGrosze: 5500 },
      ],
      fixedCosts: {
        rent: 250_000,
        utilities: 120_000,
        fuel: 80_000,
        vehicle: 70_000,
        insurance: 60_000,
        licenses: 25_000,
        marketing: 150_000,
        software: 25_000,
        professional: 40_000,
        tax: 180_000,
        maintenance: 40_000,
        other: 30_000,
      },
      updatedAt: new Date().toISOString(),
    };
    setScenario(defaults);
    await persist(defaults);
    toast.success("Reset to defaults");
  };

  const addLaborRow = () => {
    update((s) => ({
      ...s,
      labor: [
        ...s.labor,
        {
          id: `line-${Date.now().toString(36)}`,
          role: "other",
          headcount: 1,
          hoursPerWeek: 40,
          hourlyRateGrosze: 2500,
        },
      ],
    }));
  };

  const removeLaborRow = (id: string) => {
    update((s) => ({ ...s, labor: s.labor.filter((l) => l.id !== id) }));
  };

  const updateLabor = (id: string, patch: Partial<SimulationLaborLine>) => {
    update((s) => ({
      ...s,
      labor: s.labor.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  };

  const updateFixed = (key: BusinessCostCategory, plnStr: string) => {
    const pln = parseFloat(plnStr || "0");
    const grosze = Number.isFinite(pln) ? Math.max(0, Math.round(pln * 100)) : 0;
    update((s) => ({ ...s, fixedCosts: { ...s.fixedCosts, [key]: grosze } }));
  };

  const sensitivities = [-0.2, -0.1, 0, 0.1, 0.2].map((delta) => {
    const flexed: SimulationScenario = {
      ...scenario,
      ordersPerDay: Math.max(0, Math.round(scenario.ordersPerDay * (1 + delta))),
    };
    return { delta, computed: computeScenario(flexed) };
  });

  const pieData = [
    { name: "Ingredients (COGS)", value: computed.monthlyCogs / 100 },
    { name: "Labor", value: computed.laborMonthly / 100 },
    { name: "Fixed costs", value: computed.fixedTotal / 100 },
    ...(computed.netProfit > 0
      ? [{ name: "Net profit", value: computed.netProfit / 100 }]
      : []),
  ];

  const profitTone = computed.netProfit >= 0 ? "success" : "danger";

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="v2-page-title">Simulation</h1>
            <Badge tone="warning" variant="soft" dot>
              Sandbox — not the real ledger
            </Badge>
          </div>
          <p className="v2-page-subtitle">
            Sandbox monthly P&amp;L. Enter realistic orders, ticket size, labor mix and fixed costs;
            see revenue, cost-by-category, net profit, margin and break-even update live. Edits
            never write to the business-costs ledger. Defaults reflect a Neapolitan pizza truck in
            Warsaw 2026 with a 12:00–22:00 service window plus prep + close-down (~11 h/day),
            hourly rates already include the ~22% ZUS pracodawcy narzut, food-truck pitch fees,
            and 30% blended COGS.
          </p>
        </div>
        <div className="v2-page-actions">
          <Button
            variant="ghost"
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => setResetConfirmOpen(true)}
          >
            Reset defaults
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Database className="h-3.5 w-3.5" />}
            onClick={() => setSeedConfirmOpen(true)}
          >
            Seed from last 30 days
          </Button>
          <Button
            variant="primary"
            leadingIcon={<Save className="h-3.5 w-3.5" />}
            onClick={() => persist(scenario)}
            loading={saving}
          >
            Save scenario
          </Button>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Monthly revenue"
          value={computed.monthlyRevenue / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone="brand"
          hint={`${scenario.ordersPerDay} orders/day × ${scenario.daysOpenPerMonth} days`}
        />
        <KpiCard
          label="Total cost"
          value={computed.totalCost / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Banknote}
          tone="warning"
          hint={`COGS + labor + fixed`}
        />
        <KpiCard
          label="Net profit"
          value={computed.netProfit / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={computed.netProfit >= 0 ? TrendingUp : TrendingDown}
          tone={profitTone}
          hint={`${(computed.margin * 100).toFixed(1)}% margin`}
        />
        <KpiCard
          label="Break-even"
          value={computed.breakEvenOrdersPerDay}
          format={(n) => `${n.toFixed(1)} orders/day`}
          icon={Calculator}
          tone="info"
          hint={`@ ${formatPrice(scenario.avgTicketGrosze)} ticket`}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
        <Card>
          <CardHeader title="Revenue inputs" description="Volume and ticket assumptions." />
          <CardBody>
            <div className="v2-stack-12">
              <Input
                label="Orders per day"
                type="number"
                min="0"
                value={String(scenario.ordersPerDay)}
                onChange={(e) =>
                  update((s) => ({ ...s, ordersPerDay: Math.max(0, parseInt(e.target.value || "0", 10)) }))
                }
              />
              <Input
                label="Average ticket"
                type="number"
                step="0.01"
                min="0"
                value={(scenario.avgTicketGrosze / 100).toFixed(2)}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    avgTicketGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                  }))
                }
                trailingAdornment={<span className="v2-muted">zł</span>}
              />
              <Input
                label="Days open per month"
                type="number"
                min="0"
                max="31"
                value={String(scenario.daysOpenPerMonth)}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    daysOpenPerMonth: Math.max(0, Math.min(31, parseInt(e.target.value || "0", 10))),
                  }))
                }
              />
              <Input
                label="Ingredient cost ratio"
                type="number"
                step="1"
                min="0"
                max="100"
                value={String(Math.round(scenario.cogsPct * 100))}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    cogsPct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
                  }))
                }
                trailingAdornment={<span className="v2-muted">%</span>}
                description="Share of revenue eaten by food cost. 28–32% is typical for pizza + pasta + coffee."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Labor mix"
            description="Per-role headcount × weekly hours × hourly rate. Default rates are Warsaw 2026 brutto × 1.22 (full employer cost incl. ZUS narzut). Divide by 1.22 if you'd rather think in pure brutto."
            actions={
              <Button size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addLaborRow}>
                Add row
              </Button>
            }
          />
          <CardBody>
            <div className="v2-stack-12">
              {scenario.labor.map((line) => {
                const monthly = Math.round(
                  line.headcount * line.hoursPerWeek * WEEKS_PER_MONTH * line.hourlyRateGrosze,
                );
                return (
                  <div key={line.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-4">
                      <Select
                        label="Role"
                        value={line.role}
                        onChange={(e) =>
                          updateLabor(line.id, { role: e.target.value as BusinessCostPayrollRole })
                        }
                        options={(Object.keys(PAYROLL_ROLE_LABEL) as BusinessCostPayrollRole[]).map(
                          (k) => ({ value: k, label: PAYROLL_ROLE_LABEL[k] }),
                        )}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <Input
                        label="Count"
                        type="number"
                        min="0"
                        value={String(line.headcount)}
                        onChange={(e) =>
                          updateLabor(line.id, {
                            headcount: Math.max(0, parseInt(e.target.value || "0", 10)),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input
                        label="h / wk"
                        type="number"
                        min="0"
                        value={String(line.hoursPerWeek)}
                        onChange={(e) =>
                          updateLabor(line.id, {
                            hoursPerWeek: Math.max(0, parseInt(e.target.value || "0", 10)),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-4 md:col-span-3">
                      <Input
                        label="zł / h"
                        type="number"
                        step="0.5"
                        min="0"
                        value={(line.hourlyRateGrosze / 100).toFixed(2)}
                        onChange={(e) =>
                          updateLabor(line.id, {
                            hourlyRateGrosze: Math.max(
                              0,
                              Math.round(parseFloat(e.target.value || "0") * 100),
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLaborRow(line.id)}
                        aria-label={`Remove ${PAYROLL_ROLE_LABEL[line.role]} row`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="col-span-12 text-xs v2-muted -mt-1">
                      Monthly cost on this line: <strong>{formatPrice(monthly)}</strong>
                    </div>
                  </div>
                );
              })}
              {scenario.labor.length === 0 && (
                <div className="v2-muted text-sm">
                  No labor rows. Add at least one to capture payroll.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Fixed monthly costs"
            description="What you pay every month regardless of orders."
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              {FIXED_COST_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  type="number"
                  step="0.01"
                  min="0"
                  value={((scenario.fixedCosts[f.key] ?? 0) / 100).toFixed(2)}
                  onChange={(e) => updateFixed(f.key, e.target.value)}
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        <Card>
          <CardHeader
            title="Profit & loss breakdown"
            description="Top-down monthly P&L using the inputs above."
            actions={<FlaskConical className="h-4 w-4 v2-muted" />}
          />
          <CardBody>
            <ul className="v2-mov-list">
              <PnlRow label="Revenue" amount={computed.monthlyRevenue} tone="brand" bold />
              <PnlRow label={`Ingredients (${Math.round(scenario.cogsPct * 100)}%)`} amount={-computed.monthlyCogs} tone="warning" indent />
              <PnlRow label="Gross profit" amount={computed.monthlyRevenue - computed.monthlyCogs} tone="info" bold />
              <PnlRow label="Labor" amount={-computed.laborMonthly} tone="warning" indent />
              {computed.laborByRole
                .filter((r) => r.grosze > 0)
                .sort((a, b) => b.grosze - a.grosze)
                .map((r) => (
                  <PnlRow
                    key={r.role}
                    label={PAYROLL_ROLE_LABEL[r.role]}
                    amount={-r.grosze}
                    tone="neutral"
                    indent
                    indent2
                    small
                  />
                ))}
              <PnlRow label="Fixed costs" amount={-computed.fixedTotal} tone="warning" indent />
              {FIXED_COST_FIELDS.filter((f) => (scenario.fixedCosts[f.key] ?? 0) > 0).map((f) => (
                <PnlRow
                  key={f.key}
                  label={f.label}
                  amount={-(scenario.fixedCosts[f.key] ?? 0)}
                  tone="neutral"
                  indent
                  indent2
                  small
                />
              ))}
              <PnlRow
                label="Net profit / (loss)"
                amount={computed.netProfit}
                tone={profitTone}
                bold
                hint={`${(computed.margin * 100).toFixed(1)}% margin`}
              />
            </ul>
            <div className="v2-muted text-sm mt-3">
              Break-even: <strong>{computed.breakEvenOrdersPerDay.toFixed(1)} orders/day</strong> at
              the current ticket — currently running{" "}
              <strong>
                {scenario.ordersPerDay >= computed.breakEvenOrdersPerDay
                  ? `${(scenario.ordersPerDay - computed.breakEvenOrdersPerDay).toFixed(1)} above`
                  : `${(computed.breakEvenOrdersPerDay - scenario.ordersPerDay).toFixed(1)} below`}{" "}
              </strong>
              break-even.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cost share"
            description="Where each złoty goes."
            actions={<ChefHat className="h-4 w-4 v2-muted" />}
          />
          <CardBody>
            <PieChart
              data={pieData}
              height={280}
              format={(n, name) => `${name}: ${Math.round(n).toLocaleString("pl-PL")} zł`}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Sensitivity — net profit at −20% … +20% volume"
          description="What happens to the bottom line if orders/day moves around the current point."
        />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {sensitivities.map(({ delta, computed: c }) => (
              <KpiCard
                key={delta}
                label={`${delta === 0 ? "Base" : `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`} volume`}
                value={c.netProfit / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone={c.netProfit >= 0 ? "success" : "danger"}
                hint={`${(c.margin * 100).toFixed(1)}% margin`}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={seedConfirmOpen}
        onClose={() => setSeedConfirmOpen(false)}
        onConfirm={seedFromHistory}
        title="Seed from the last 30 days?"
        description="Populates the simulator with payroll and fixed costs derived from your active business-costs ledger. The ledger is read-only here — none of your real cost data changes."
        confirmLabel="Seed scenario"
      />
      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={resetToDefaults}
        title="Reset to Warsaw 2026 defaults?"
        description="Resets every input back to the built-in Warsaw 2026 pizza-truck defaults: 70 orders/day, 65 zł blended ticket, 12-22 service window, brutto × 1.22 employer rates and food-truck pitch fees. Your current scenario is overwritten."
        confirmLabel="Reset"
        destructive
      />
    </div>
  );
}

function PnlRow({
  label,
  amount,
  tone,
  bold,
  small,
  indent,
  indent2,
  hint,
}: {
  label: string;
  amount: number;
  tone: "brand" | "info" | "warning" | "success" | "danger" | "neutral";
  bold?: boolean;
  small?: boolean;
  indent?: boolean;
  indent2?: boolean;
  hint?: string;
}) {
  const pad = indent2 ? "pl-8" : indent ? "pl-4" : "";
  const weight = bold ? "font-semibold" : "";
  const size = small ? "text-xs" : "";
  return (
    <li className={`v2-mov-row ${pad}`}>
      <span className={`v2-mov-icon v2-mov-tone-${tone}`}>
        <Wallet className="h-3 w-3" />
      </span>
      <div className="v2-mov-text">
        <div className={`v2-mov-title ${weight} ${size}`}>
          <span>{label}</span>
          {hint && <span className="v2-muted">{hint}</span>}
        </div>
      </div>
      <span className={`v2-mov-time tabular ${weight} ${size}`}>
        {amount < 0 ? `−${formatPrice(-amount)}` : formatPrice(amount)}
      </span>
    </li>
  );
}
