"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SimulationMenuEngineeringLine } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, ChipRow, InfoButton, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

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
        <Kpi
          label="Stars"
          value={`${counts.star}`}
          accentVar="--av3-c4"
          info={
            <InfoButton
              title="Stars"
              description="Dishes that are both high-volume and high-margin — the top-right quadrant of the Kasavana-Smith matrix."
              institutional="Stars are the menu's franchise — they prove product-market fit and carry the contribution. The institutional move is to protect and feature them relentlessly; too few stars means an undifferentiated menu, and stars that are fragile (single supplier, prep-heavy) carry hidden risk."
              plain="Your heroes: people order them and they make you good money — e.g. a Margherita selling 40/day at 14 zł gross profit each. These go on the hero image, the top of the menu, and never out of stock."
              tips="Protect, promote, anchor: prime menu placement, make them the default in combos, and guard recipe + quality — consistency is what keeps a star a star (Rule #10)."
              methodology="Items above the median on both velocity (units sold) and per-unit gross profit over the window, split at the median of each."
            />
          }
        />
        <Kpi
          label="Puzzles"
          value={`${counts.puzzle}`}
          accentVar="--av3-c3"
          info={
            <InfoButton
              title="Puzzles"
              description="High-margin but low-volume dishes — the bottom-right quadrant. Profitable when they sell; they just don't sell enough."
              institutional="Puzzles are a demand problem, not a margin problem. The institutional play is to drive trial — placement, naming, photography, attach/upsell — before touching price. A puzzle that can't be made to move eventually becomes a dog."
              plain="Great earners nobody notices — e.g. a 22 zł Burrata with 12 zł margin that sells 4/day. Get more people to try it and each extra sale is almost pure contribution."
              tips="Push attach and upsell (cross-sell slots, combos, a 'Chef's signature' badge), move them higher on the menu, and improve the description/photo. Don't discount — that destroys the one thing they have going for them."
              methodology="Items above the median on per-unit gross profit but below the median on velocity, over the selected window."
            />
          }
        />
        <Kpi
          label="Plowhorses"
          value={`${counts.plowhorse}`}
          accentVar="--av3-c5"
          info={
            <InfoButton
              title="Plowhorses"
              description="High-volume but thin-margin dishes — the top-left quadrant. Popular workhorses that don't earn enough per plate."
              institutional="Plowhorses are the highest-leverage repricing / re-engineering target: a small per-unit gain × big volume moves blended contribution more than anything else on the board. The risk is price elasticity — they're popular precisely because they're keenly priced."
              plain="Crowd-pleasers that barely pay — e.g. a 28 zł pasta selling 35/day at only 6 zł margin. A 2 zł price bump or a 1 zł recipe trim across that volume is real money."
              tips="Reprice up modestly or re-engineer the recipe cost (cheaper-but-equal ingredient, smaller garnish), and bundle them to lift attach. Model the contribution impact on the Calculator sandbox before changing the live menu."
              methodology="Items above the median on velocity but below the median on per-unit gross profit, over the selected window."
            />
          }
        />
        <Kpi
          label="Dogs"
          value={`${counts.dog}`}
          accentVar="--av3-c1"
          info={
            <InfoButton
              title="Dogs"
              description="Low-volume and low-margin dishes — the bottom-left quadrant. They neither sell nor earn."
              institutional="Dogs are pruning candidates. Every SKU costs prep, stock, training and menu real-estate; a long tail of dogs quietly erodes kitchen throughput and raises waste without moving revenue. Keep one only if it's a strategic anchor (dietary coverage, a signature, a loss-leader that drives attach)."
              plain="The dead weight — e.g. a 19 zł side selling 2/day at 3 zł margin. Cutting it speeds the line and shortens the stock list; almost nobody notices."
              tips="Cut unless it's strategic; if you keep it, re-cost it or reposition it as a puzzle (raise the margin) — don't just leave it. Re-test after a menu refresh to confirm it's truly dead."
              methodology="Items below the median on both velocity and per-unit gross profit, over the selected window."
            />
          }
        />
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
