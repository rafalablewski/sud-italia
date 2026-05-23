"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  Crown,
  Puzzle,
  Tractor,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  InfoButton,
  Select,
  Table,
  type BadgeTone,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";
import { formatPricePLN } from "@/lib/utils";
import type { SimulationMenuEngineeringLine } from "@/data/types";

type Quadrant = SimulationMenuEngineeringLine["quadrant"];

interface ApiResponse {
  windowDays: number;
  location: string;
  items: SimulationMenuEngineeringLine[];
}

const WINDOW_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
];

const QUADRANT_META: Record<
  Quadrant,
  { label: string; sub: string; tone: BadgeTone; tint: string; verdict: string }
> = {
  star: {
    label: "Stars",
    sub: "High volume · high margin",
    tone: "success",
    tint: "rgba(34,197,94,0.10)",
    verdict: "Protect. Promote. Anchor the menu.",
  },
  puzzle: {
    label: "Puzzles",
    sub: "Low volume · high margin",
    tone: "info",
    tint: "rgba(59,130,246,0.10)",
    verdict: "Push attach / upsell — these need marketing.",
  },
  plowhorse: {
    label: "Plowhorses",
    sub: "High volume · low margin",
    tone: "warning",
    tint: "rgba(245,158,11,0.10)",
    verdict: "Reprice up or re-engineer the recipe.",
  },
  dog: {
    label: "Dogs",
    sub: "Low volume · low margin",
    tone: "danger",
    tint: "rgba(239,68,68,0.10)",
    verdict: "Delete unless strategic — they cost menu real-estate.",
  },
};

const ROLE_BADGE: Record<NonNullable<SimulationMenuEngineeringLine["menuRole"]>, { label: string; tone: BadgeTone }> = {
  hero: { label: "HERO", tone: "warning" },
  "profit-driver": { label: "DRIVER", tone: "success" },
  anchor: { label: "ANCHOR", tone: "brand" },
};

function actionFor(r: SimulationMenuEngineeringLine): string {
  if (r.marginTrap) return "Reprice up or pull from delivery — fees eat the margin";
  if (r.quadrant === "dog") return r.menuRole === "anchor"
    ? "Keep — premium decoy by design"
    : "Delete unless strategic";
  if (r.quadrant === "plowhorse") return "Reprice up or re-engineer the recipe";
  if (r.quadrant === "puzzle") return "Push attach / upsell to lift velocity";
  return "Protect & promote";
}

function gmPct(r: SimulationMenuEngineeringLine): number {
  return r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0;
}

export function AdminMenuEngineering() {
  const { location, activeLocations } = useAdminLocation();
  const [windowDays, setWindowDays] = useState("90");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: windowDays });
      if (location) params.set("location", location);
      const res = await fetch(`/api/admin/menu-engineering?${params.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [windowDays, location]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => data?.items ?? [], [data]);

  const byQuadrant = useMemo(() => {
    const acc: Record<Quadrant, SimulationMenuEngineeringLine[]> = {
      star: [],
      puzzle: [],
      plowhorse: [],
      dog: [],
    };
    for (const r of rows) acc[r.quadrant].push(r);
    for (const k of Object.keys(acc) as Quadrant[]) acc[k].sort((a, b) => b.revenue - a.revenue);
    return acc;
  }, [rows]);

  const summary = useMemo(() => {
    const traps = rows.filter((r) => r.marginTrap || r.spoilageRisk || (r.deliveryOnly && r.trueCm1PerUnit < 500));
    const windowGp = rows.reduce((s, r) => s + (r.revenue - r.cost), 0);
    return {
      items: rows.length,
      stars: byQuadrant.star.length,
      actionNeeded: byQuadrant.plowhorse.length + byQuadrant.dog.length,
      traps: traps.length,
      windowGp,
    };
  }, [rows, byQuadrant]);

  const locationLabel = location
    ? activeLocations.find((l) => l.slug === location)?.name ?? location
    : "All locations";

  const columns: Column<SimulationMenuEngineeringLine>[] = [
    {
      key: "name",
      header: "Item",
      sortValue: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontWeight: 500 }}>{r.name}</span>
          {r.menuRole && (
            <Badge tone={ROLE_BADGE[r.menuRole].tone} variant="soft">
              {ROLE_BADGE[r.menuRole].label}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortValue: (r) => r.category,
      cell: (r) => <span className="v2-muted" style={{ textTransform: "capitalize" }}>{r.category}</span>,
    },
    {
      key: "quadrant",
      header: "Quadrant",
      sortValue: (r) => r.quadrant,
      cell: (r) => (
        <Badge tone={QUADRANT_META[r.quadrant].tone} variant="soft">
          {QUADRANT_META[r.quadrant].label.replace(/s$/, "")}
        </Badge>
      ),
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      sortValue: (r) => r.unitsSold,
      cell: (r) => <span className="tabular">{r.unitsSold.toLocaleString()}</span>,
    },
    {
      key: "gp",
      header: "GP / unit",
      align: "right",
      sortValue: (r) => r.gpPerUnit,
      cell: (r) => <span className="tabular">{formatPricePLN(Math.round(r.gpPerUnit))}</span>,
    },
    {
      key: "gm",
      header: "GM %",
      align: "right",
      sortValue: (r) => gmPct(r),
      cell: (r) => <span className="tabular">{gmPct(r).toFixed(0)}%</span>,
    },
    {
      key: "cm1",
      header: "True CM1 / unit",
      align: "right",
      sortValue: (r) => r.trueCm1PerUnit,
      cell: (r) => (
        <span className="tabular" style={r.marginTrap ? { color: "rgb(220,38,38)" } : undefined}>
          {formatPricePLN(Math.round(r.trueCm1PerUnit))}
        </span>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortValue: (r) => r.revenue,
      cell: (r) => <span className="tabular">{formatPricePLN(Math.round(r.revenue))}</span>,
    },
    {
      key: "flags",
      header: "Flags",
      cell: (r) => (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {r.marginTrap && <Badge tone="danger" variant="soft">trap</Badge>}
          {r.spoilageRisk && <Badge tone="warning" variant="soft">spoilage</Badge>}
          {r.prepHeavy && <Badge tone="warning" variant="soft">prep-heavy</Badge>}
          {r.deliveryOnly && <Badge tone="info" variant="soft">delivery</Badge>}
        </span>
      ),
    },
    {
      key: "action",
      header: "Recommended action",
      cell: (r) => <span className="v2-muted" style={{ fontSize: 12 }}>{actionFor(r)}</span>,
    },
  ];

  const traps = rows.filter((r) => r.marginTrap || r.spoilageRisk || (r.deliveryOnly && r.trueCm1PerUnit < 500));
  const prepHeavy = rows.filter((r) => r.prepHeavy);

  return (
    <div className="v2-page">
      <Card>
        <CardHeader
          title="Menu engineering"
          description="Kasavana-Smith quadrants over real order line items — every item that sold ≥ 1 unit in the window, plotted by velocity (units sold) and per-unit gross profit. Cuts at the median of each."
          actions={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <InfoButton title="Menu engineering" label="About the Kasavana-Smith matrix">
                <p>
                  The standard QSR menu-engineering tool. Each item is plotted on two axes:
                  velocity (units sold) and per-unit gross profit, split at the median of each.
                </p>
                <ul>
                  <li><strong>Stars</strong> — high volume × high margin. Protect, promote, anchor the menu.</li>
                  <li><strong>Puzzles</strong> — low volume × high margin. Push attach / upsell; they need marketing.</li>
                  <li><strong>Plowhorses</strong> — high volume × low margin. Reprice up or re-engineer the recipe.</li>
                  <li><strong>Dogs</strong> — low volume × low margin. Delete unless strategic.</li>
                </ul>
                <p>
                  <strong>True CM1</strong> nets per-unit GP against payment fees, waste, refunds and
                  loyalty burn (delivery-only items at a 27% marketplace-commission proxy). When an
                  item looks high-margin on GP but True CM1 collapses, it&apos;s flagged as a margin trap.
                </p>
              </InfoButton>
              <div style={{ minWidth: 160 }}>
                <Select
                  aria-label="Window"
                  value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value)}
                  options={WINDOW_OPTIONS}
                />
              </div>
            </span>
          }
        />
        <CardBody>
          <div className="v2-muted" style={{ fontSize: 13 }}>
            Scope: <strong>{locationLabel}</strong>
            {data ? ` · ${summary.items} items sold in the last ${data.windowDays} days` : ""}
            {" "}— switch location from the top-bar selector.
          </div>
        </CardBody>
      </Card>

      {loading && (
        <Card>
          <CardBody>
            <div className="v2-muted" style={{ padding: 24, textAlign: "center" }}>Loading menu engineering…</div>
          </CardBody>
        </Card>
      )}

      {!loading && error && (
        <Card>
          <CardBody>
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load menu engineering"
              description={error}
            />
          </CardBody>
        </Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <Card>
          <CardBody>
            <EmptyState
              icon={UtensilsCrossed}
              title="No sales in this window"
              description="No order line items in the selected window for this location. Widen the window or pick a location with order history."
            />
          </CardBody>
        </Card>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="v2-kpi-grid">
            <KpiCard label="Items analysed" value={summary.items} icon={UtensilsCrossed} tone="brand" staticValue />
            <KpiCard label="Stars" value={summary.stars} icon={Crown} tone="success" staticValue
              hint="High volume × high margin" />
            <KpiCard label="Action needed" value={summary.actionNeeded} icon={Tractor} tone="warning" staticValue
              hint="Plowhorses + dogs" />
            <KpiCard label="Margin traps" value={summary.traps} icon={AlertTriangle} tone="danger" staticValue
              hint="High GM, low True CM1" />
            <KpiCard label="Window gross profit" value={summary.windowGp} display={formatPricePLN(Math.round(summary.windowGp))}
              icon={Award} tone="info" staticValue hint={`Last ${data?.windowDays ?? windowDays} days`} />
          </div>

          <Card>
            <CardHeader
              title="The matrix"
              description="Items grouped by quadrant, sorted by revenue contribution within each. Operator role tags (HERO / DRIVER / ANCHOR) carry through — an anchor in the puzzle quadrant is there by design."
            />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(["star", "puzzle", "plowhorse", "dog"] as const).map((q) => {
                  const meta = QUADRANT_META[q];
                  const items = byQuadrant[q];
                  const Icon = q === "star" ? Crown : q === "puzzle" ? Puzzle : q === "plowhorse" ? Tractor : Trash2;
                  return (
                    <div key={q} style={{ background: meta.tint, borderRadius: 10, padding: 14 }}>
                      <div className="flex justify-between items-start" style={{ marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <Icon className="h-4 w-4" /> {meta.label}
                            <Badge tone={meta.tone} variant="soft">{items.length}</Badge>
                          </div>
                          <div className="v2-muted text-xs">{meta.sub}</div>
                        </div>
                      </div>
                      <div className="v2-muted text-xs" style={{ fontStyle: "italic", marginBottom: 8 }}>{meta.verdict}</div>
                      {items.length === 0 ? (
                        <div className="v2-muted text-xs">No items.</div>
                      ) : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {items.slice(0, 12).map((r) => (
                            <li key={r.menuItemId} className="flex justify-between items-baseline"
                              style={{ padding: "5px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                              <span style={{ fontSize: 13, fontWeight: 500, display: "inline-flex", gap: 5, alignItems: "center" }}>
                                {r.name}
                                {r.menuRole && (
                                  <Badge tone={ROLE_BADGE[r.menuRole].tone} variant="soft">{ROLE_BADGE[r.menuRole].label}</Badge>
                                )}
                              </span>
                              <span className="v2-muted text-xs tabular">
                                {r.unitsSold}× · {formatPricePLN(Math.round(r.gpPerUnit))}/u
                              </span>
                            </li>
                          ))}
                          {items.length > 12 && (
                            <li className="v2-muted text-xs" style={{ paddingTop: 6 }}>+{items.length - 12} more — see table below</li>
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {(traps.length > 0 || prepHeavy.length > 0) && (
            <Card>
              <CardHeader
                title="Margin traps & false high-revenue items"
                description="Items where the gross-margin look-through breaks down: delivery-only marketplace casualties, spoilage-risk items, and prep-heavy items that eat kitchen throughput the labor model doesn't price."
                actions={<AlertTriangle className="h-4 w-4 v2-muted" />}
              />
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {traps.length > 0 && (
                    <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Margin traps</div>
                      <div className="v2-muted text-xs" style={{ fontStyle: "italic", marginBottom: 8 }}>
                        High GM, low True CM1 after fees / spoilage / marketplace commission.
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {traps.slice(0, 12).map((r) => {
                          const reasons: string[] = [];
                          if (r.deliveryOnly) reasons.push("delivery-only");
                          if (r.spoilageRisk) reasons.push("spoilage risk");
                          if (r.marginTrap) reasons.push("fees eat margin");
                          return (
                            <li key={r.menuItemId} style={{ padding: "6px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                              <div className="flex justify-between items-baseline">
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                                <span className="v2-muted text-xs tabular">
                                  GM {gmPct(r).toFixed(0)}% · CM1 {formatPricePLN(Math.round(r.trueCm1PerUnit))}
                                </span>
                              </div>
                              <div className="v2-muted text-xs" style={{ fontStyle: "italic" }}>{reasons.join(" · ")}</div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {prepHeavy.length > 0 && (
                    <div style={{ background: "rgba(245,158,11,0.06)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Prep-heavy items</div>
                      <div className="v2-muted text-xs" style={{ fontStyle: "italic", marginBottom: 8 }}>
                        Prep time ≥ 1.5× median — kitchen throughput cost the labor model doesn&apos;t budget.
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {prepHeavy.slice(0, 12).map((r) => (
                          <li key={r.menuItemId} className="flex justify-between items-baseline"
                            style={{ padding: "6px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                            <span className="v2-muted text-xs tabular">{r.prepTimeMinutes} min · {r.unitsSold}× sold</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="All items" description="Sortable. True CM1 nets per-unit GP against fees, waste, refunds and loyalty burn." />
            <CardBody>
              <Table
                rows={rows}
                columns={columns}
                rowKey={(r) => r.menuItemId}
                defaultSort={{ key: "revenue", dir: "desc" }}
                density="compact"
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
