"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SimulationMenuEngineeringLine } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, ChipRow, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

type Quadrant = SimulationMenuEngineeringLine["quadrant"];
const QUAD: Record<Quadrant, { label: string; tone: BadgeTone; verdict: string }> = {
  star: { label: "Star", tone: "ok", verdict: "Protect & promote" },
  puzzle: { label: "Puzzle", tone: "info", verdict: "Push attach / upsell" },
  plowhorse: { label: "Plowhorse", tone: "warn", verdict: "Reprice up / re-engineer" },
  dog: { label: "Dog", tone: "bad", verdict: "Cut unless strategic" },
};
const ROLE: Record<string, { label: string; tone: BadgeTone }> = {
  hero: { label: "HERO", tone: "warn" }, "profit-driver": { label: "DRIVER", tone: "ok" }, anchor: { label: "ANCHOR", tone: "brand" },
};
const WINDOWS = [{ value: "30", label: "30d" }, { value: "60", label: "60d" }, { value: "90", label: "90d" }, { value: "180", label: "180d" }];

function margin(r: SimulationMenuEngineeringLine) { return r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0; }

export function MenuEngineeringV3() {
  const { location } = useAdminLocationV3();
  const [items, setItems] = useState<SimulationMenuEngineeringLine[]>([]);
  const [win, setWin] = useState("90");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Quadrant>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const locParam = location ? `&location=${location}` : "";
    const res = await fetch(`/api/admin/menu-engineering?window=${win}${locParam}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setItems(Array.isArray(res?.items) ? res.items : []);
    setLoading(false);
  }, [win, location]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, star: 0, puzzle: 0, plowhorse: 0, dog: 0 };
    for (const i of items) c[i.quadrant]++;
    return c;
  }, [items]);
  const rows = useMemo(() => (filter === "all" ? items : items.filter((i) => i.quadrant === filter)).slice().sort((a, b) => b.revenue - a.revenue), [items, filter]);
  const chips: ("all" | Quadrant)[] = ["all", "star", "puzzle", "plowhorse", "dog"];

  const cols: ColumnV3<SimulationMenuEngineeringLine>[] = [
    { key: "name", header: "Dish", render: (r) => <span style={{ fontWeight: 600 }}>{r.name}{r.menuRole && ROLE[r.menuRole] ? <span style={{ marginLeft: 6 }}><Badge tone={ROLE[r.menuRole].tone}>{ROLE[r.menuRole].label}</Badge></span> : null}</span> },
    { key: "quad", header: "Class", render: (r) => <Badge tone={QUAD[r.quadrant].tone} dot>{QUAD[r.quadrant].label}</Badge> },
    { key: "qty", header: "Sold", num: true, render: (r) => r.unitsSold.toLocaleString("pl-PL") },
    { key: "rev", header: "Revenue", num: true, render: (r) => formatPrice(r.revenue) },
    { key: "margin", header: "Margin", num: true, render: (r) => `${margin(r).toFixed(0)}%` },
    { key: "verdict", header: "Action", render: (r) => <span className="av3-cell-muted">{QUAD[r.quadrant].verdict}</span> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Menu engineering</h1>
          <div className="av3-pagehead-sub">Stars · puzzles · plowhorses · dogs — by volume × margin</div>
        </div>
        <div className="av3-pagehead-actions">
          <ChipRow options={WINDOWS} value={win} onChange={setWin} ariaLabel="Window" />
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Stars" icon={undefined} value={`${counts.star}`} accentVar="--av3-c4" />
        <Kpi label="Puzzles" value={`${counts.puzzle}`} accentVar="--av3-c3" />
        <Kpi label="Plowhorses" value={`${counts.plowhorse}`} accentVar="--av3-c5" />
        <Kpi label="Dogs" value={`${counts.dog}`} accentVar="--av3-c1" />
      </div>

      <div className="av3-filterchips">
        {chips.map((f) => (
          <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : QUAD[f].label}<span className="av3-fchip-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Analysing the menu…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">Not enough data</div><div className="av3-empty-text">Menu engineering needs sales in the window to classify dishes.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(r) => r.name} />
          )}
        </div>
      )}
    </>
  );
}
