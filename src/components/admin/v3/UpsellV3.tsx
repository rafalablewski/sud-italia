"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Layers, Percent, Plus, Rocket, Rows3, ShoppingBag, Trash2, Wallet } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { DEFAULT_BUNDLES } from "@/lib/bundles";
import type { MenuCategory, ModifierGroup } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, type ColumnV3, Dialog, InfoButton, Kpi, SkeletonRows, Switch, Table } from "./ui";

/* ── shapes (mirror src/components/admin/AdminSellingShared) ────────────── */
interface BundleSlot { kind: "category" | "item"; category?: string; itemIdSuffix?: string; quantity: number }
interface Bundle {
  id: string; tier: string; name: string; description: string; composition: BundleSlot[]; mealPeriod: string;
  isAnchor?: boolean; isDecoy?: boolean; isDefault?: boolean; active: boolean;
  pricingMode?: "fixed" | "dynamic"; priceGrosze?: number; refPriceGrosze?: number;
  mainCategories?: string[]; minMains?: number; maxMains?: number;
  discountPercent?: number; mainsDiscountPercent?: number; addOnsDiscountPercent?: number;
  requiredTier?: "gold" | "platinum"; limitedUntil?: string; activeDays?: string[];
  channel?: "dine-in" | "delivery"; membersOnly?: boolean;
}
interface BundleRules { lunch: { startHour: number; endHour: number }; family: { minMainItems: number; hintWithin: number } }
interface ExpVariant { id: string; label: string; weight: number; bundleOverrides?: Record<string, number | { discountPercent?: number }> }
interface Experiment { id: string; name: string; active: boolean; variants: ExpVariant[]; status?: "draft" | "running" | "stopped"; startedAt?: string; stoppedAt?: string; controlVariantId?: string; primaryMetric?: "conversion" | "aov" | "contribution" }
interface LocationConfig {
  bundles?: Bundle[]; bundleRules?: BundleRules; experiment?: Experiment | null; mlUpsellRolloutPct?: number; [k: string]: unknown;
}
type Settings = Record<string, LocationConfig>;
interface MenuItemLite { id: string; name: string; modifierGroups?: ModifierGroup[] }

/* ── live bundle analytics (real, from /api/admin/bundle-analytics) ──────── */
interface BundleRollupLite {
  bundleId: string; bundleName: string; count: number; avgFinalGrosze: number; avgSavingsGrosze: number;
  effectiveDiscount: number; thumbsUp: number; thumbsDown: number; thumbsDownRate: number;
  refundRate: number; totalRevenueGrosze: number;
}
interface BundleAnalyticsLite {
  windowDays: number; totalBundleOrders: number; totalBundleRevenueGrosze: number; totalSavingsGrosze: number;
  byBundle: BundleRollupLite[];
  funnel: { impressions: number; composerOpens: number; composerAbandons: number; applies: number; composerOpenRate: number; applyFromComposerRate: number };
}
const ANALYTICS_DAYS = 30;

const CATEGORIES: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT_RULES: BundleRules = { lunch: { startHour: 11, endHour: 14 }, family: { minMainItems: 3, hintWithin: 1 } };

/** Meal-period grouping for the board view (defaults order matches the ladder). */
const MEAL_ORDER = ["lunch", "family", "lateNight"] as const;
const MEAL_LABEL: Record<string, string> = { lunch: "Lunch ladder", family: "Family ladder", lateNight: "Late-night ladder", other: "Other" };
const mealKey = (p: string) => (MEAL_ORDER.includes(p as (typeof MEAL_ORDER)[number]) ? p : "other");

export function UpsellV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [settings, setSettings] = useState<Settings>({});
  const [menusByLoc, setMenusByLoc] = useState<Record<string, MenuItemLite[]>>({});
  const [analytics, setAnalytics] = useState<BundleAnalyticsLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"bundles" | "modifiers">("bundles");
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [editBundle, setEditBundle] = useState<Bundle | "new" | null>(null);

  const load = useCallback(async () => {
    const [s, an, ...menus] = await Promise.all([
      fetch("/api/admin/upsell").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(`/api/admin/bundle-analytics?location=${loc}&days=${ANALYTICS_DAYS}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ...all.map((l) => fetch(`/api/admin/menu?location=${l.slug}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])),
    ]);
    setSettings((s && typeof s === "object" ? s : {}) as Settings);
    setAnalytics(an as BundleAnalyticsLite | null);
    const map: Record<string, MenuItemLite[]> = {};
    all.forEach((l, i) => { map[l.slug] = Array.isArray(menus[i]) ? menus[i] : []; });
    setMenusByLoc(map);
    setLoading(false);
  }, [all, loc]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const cfg = settings[loc] ?? {};
  // Mirror v2 (AdminUpsell): when a location has no saved custom bundles,
  // fall back to the canonical DEFAULT_BUNDLES ladders — the same list the
  // runtime serves via resolveBundles(). Without this the board showed an
  // empty "No custom bundles" state even though ~16 default tiers are live.
  // Editing/toggling a default materialises the full list into the config
  // (saveBundles → PUT), exactly like v2's `config.bundles ?? DEFAULT_BUNDLES_FALLBACK`.
  const usingDefaultBundles = !cfg.bundles || cfg.bundles.length === 0;
  const bundles = (usingDefaultBundles ? DEFAULT_BUNDLES : cfg.bundles) as Bundle[];
  const rules = (cfg.bundleRules ?? DEFAULT_RULES) as BundleRules;
  const experiment = (cfg.experiment ?? null) as Experiment | null;

  // Join live analytics rollups by bundle id for the board/editor stats.
  const statById = useMemo(() => {
    const m = new Map<string, BundleRollupLite>();
    for (const r of analytics?.byBundle ?? []) m.set(r.bundleId, r);
    return m;
  }, [analytics]);

  // KPI rail — real 30-day performance (Rule #1: no fabricated figures).
  const kpis = useMemo(() => {
    const active = bundles.filter((b) => b.active).length;
    const orders = analytics?.totalBundleOrders ?? 0;
    const revenue = analytics?.totalBundleRevenueGrosze ?? 0;
    const savings = analytics?.totalSavingsGrosze ?? 0;
    const impressions = analytics?.funnel.impressions ?? 0;
    const applies = analytics?.funnel.applies ?? 0;
    return {
      active, total: bundles.length, orders, revenue,
      aov: orders > 0 ? Math.round(revenue / orders) : 0,
      penetration: impressions > 0 ? (applies / impressions) * 100 : null,
      avgDiscount: revenue + savings > 0 ? (savings / (revenue + savings)) * 100 : null,
    };
  }, [bundles, analytics]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bundles;
    return bundles.filter((b) => `${b.tier} ${b.name} ${b.description}`.toLowerCase().includes(needle));
  }, [bundles, q]);

  const patchConfig = async (patch: Partial<LocationConfig>) => {
    const config = { ...cfg, ...patch };
    setSettings((s) => ({ ...s, [loc]: config }));
    setSaving(true);
    try { await fetch("/api/admin/upsell", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationSlug: loc, config }) }); }
    finally { setSaving(false); }
  };

  const saveBundles = (next: Bundle[]) => patchConfig({ bundles: next });
  const toggleBundle = (id: string) => saveBundles(bundles.map((b) => (b.id === id ? { ...b, active: !b.active } : b)));
  const upsertBundle = (b: Bundle) => saveBundles(bundles.some((x) => x.id === b.id) ? bundles.map((x) => (x.id === b.id ? b : x)) : [...bundles, b]);
  const removeBundle = (id: string) => saveBundles(bundles.filter((b) => b.id !== id));

  // Promote a winning A/B variant → copy its per-bundle discount overrides into
  // the live bundles + conclude the experiment (mirrors v2 handlePromoteVariant).
  const promoteVariant = (variantId: string) => {
    if (!experiment) return;
    const v = experiment.variants.find((x) => x.id === variantId);
    if (!v) return;
    const overrides = v.bundleOverrides ?? {};
    const nextBundles = bundles.map((b) => {
      const o = overrides[b.id];
      if (o === undefined) return b;
      return { ...b, discountPercent: typeof o === "number" ? o : o.discountPercent ?? b.discountPercent };
    });
    const now = new Date().toISOString();
    patchConfig({ bundles: nextBundles, experiment: { ...experiment, status: "stopped", active: false, stoppedAt: now } });
  };

  const bundleCols: ColumnV3<Bundle>[] = [
    { key: "name", header: "Bundle", render: (b) => (
      <div>
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{b.tier ? <Badge tone="neutral">{b.tier}</Badge> : null}{b.name}
          {b.isAnchor && <Badge tone="brand">anchor</Badge>}{b.isDecoy && <Badge tone="neutral">decoy</Badge>}{b.isDefault && <Badge tone="info">default</Badge>}{b.membersOnly && <Badge tone="warn">members</Badge>}
        </div>
        <div className="av3-cell-muted" style={{ fontSize: 11, maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.description}</div>
      </div>
    ) },
    { key: "meal", header: "Period", render: (b) => <span className="av3-cell-muted">{b.mealPeriod}{b.pricingMode === "dynamic" ? " · dyn" : ""}</span> },
    { key: "price", header: "Price", num: true, render: (b) => b.pricingMode === "dynamic" ? <span className="av3-cell-muted">{b.discountPercent ?? 0}% off</span> : <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(b.priceGrosze ?? 0)}{b.refPriceGrosze ? <span style={{ color: "var(--av3-subtle)", textDecoration: "line-through", marginLeft: 4 }}>{formatPrice(b.refPriceGrosze)}</span> : null}</span> },
    { key: "sold", header: `${ANALYTICS_DAYS}d sold`, num: true, render: (b) => { const s = statById.get(b.id); return s ? <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{s.count}</span> : <span className="av3-cell-muted">—</span>; } },
    { key: "act", header: "", render: (b) => <Switch checked={b.active} disabled={saving} label={b.active ? "Live" : "Paused"} onClick={(e) => e.stopPropagation()} onChange={() => toggleBundle(b.id)} /> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Upsell</h1>
          <div className="av3-pagehead-sub">Bundle ladders · rules · A/B · ML ranker — {city}{!location ? " (pick a location to switch)" : ""}{saving ? " · saving…" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          {tab === "bundles" && <Button variant="primary" size="sm" onClick={() => setEditBundle("new")}><Plus className="av3-btn-ico" /> Add bundle</Button>}
        </div>
      </div>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${tab === "bundles" ? "is-active" : ""}`} onClick={() => setTab("bundles")}>Bundles<span className="av3-fchip-count">{bundles.length}</span></button>
        <button type="button" className={`av3-fchip ${tab === "modifiers" ? "is-active" : ""}`} onClick={() => setTab("modifiers")}>Item modifiers</button>
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : tab === "modifiers" ? (
        <ModifierInventory menusByLoc={menusByLoc} locations={all} />
      ) : (
        <>
          <div className="av3-kpi-rail">
            <Kpi label="Active bundles" icon={Layers} value={`${kpis.active}/${kpis.total}`} accentVar="--av3-c2"
              info={<InfoButton title="Active bundles" description="How many bundle tiers are switched live on this location versus the total configured."
                institutional="Ladders work by contrast: a healthy anchor → core → decoy ladder needs 3–5 live tiers so the mid offer reads as the obvious pick. One live tier has nothing to anchor against; ten dilute the choice. The gate: at least one anchor and one default live per meal period."
                plain="Think of a wine list — nobody buys the cheapest, most buy the second-cheapest because the dearest one makes it look sensible. Live 4 of your 6 tiers and the 39 zł lunch+ looks like a deal next to the 49 zł feast."
                tips="Pause tiers that never sell (check the 30d-sold column) to sharpen the ladder; keep exactly one default per period; flag your hero tier as the anchor so the composer leads with it."
                methodology="Counts bundles where active === true over the resolved ladder for this location (custom override, else DEFAULT_BUNDLES). Toggling a bundle here persists immediately via PUT /api/admin/upsell." />} />
            <Kpi label={`Penetration (${ANALYTICS_DAYS}d)`} icon={Rocket} value={kpis.penetration == null ? "—" : `${kpis.penetration.toFixed(1)}%`} accentVar="--av3-c3"
              info={<InfoButton title="Bundle penetration" description="Share of bundle impressions that ended in a bundle actually applied to the cart, over the last 30 days."
                institutional="This is the headline conversion of the upsell funnel. Best-in-class QSR bundle attach sits ~8–15% of carts seeing the offer; under 4% means the offer or its framing is off, not the customer. Read it alongside the composer open-rate to see whether you lose people at the banner or inside the builder."
                plain="If 1,000 people saw the lunch bundle nudge and 90 added it, that's 9% — nine extra combos you didn't have to upsell by hand. Push it to 12% and on 1,000 impressions that's 30 more bundles a month from the same traffic."
                tips="Lead with the anchor tier; make the saving explicit on the card (the live preview shows the strikethrough); shorten composition to 2–3 slots so the builder isn't daunting; A/B the discount via the Experiment card below."
                methodology="funnel.applies ÷ funnel.impressions from /api/admin/bundle-analytics (30d, this location). Impressions come from the bundle-funnel beacon; applies from the order audit log. Shows — until impressions are logged." />} />
            <Kpi label={`Bundle AOV (${ANALYTICS_DAYS}d)`} icon={ShoppingBag} value={kpis.aov ? formatPrice(kpis.aov) : "—"} accentVar="--av3-c4"
              info={<InfoButton title="Bundle order value" description="Average final basket value of orders that included a bundle, over the last 30 days."
                institutional="The whole point of a ladder is to lift average ticket. Bundle AOV should sit meaningfully above your à-la-carte AOV (see Reports) — if it doesn't, the discount is eroding more than the attach adds. The CFO test: bundle AOV × penetration should grow contribution, not just top-line revenue."
                plain="If a normal order is 42 zł and a bundle order is 58 zł, every bundle you sell is 16 zł of basket you'd otherwise not capture. On 90 bundles a month that's ~1,440 zł of incremental ticket."
                tips="Add a high-margin slot (drink, dessert) to the composition rather than discounting the mains deeper; gate the richest tier to Gold so it lifts your best customers; watch the effective-discount KPI so the lift isn't given straight back."
                methodology="totalBundleRevenueGrosze ÷ totalBundleOrders from /api/admin/bundle-analytics (30d). Final price is the post-discount basket recorded on the order at checkout." />} />
            <Kpi label={`Revenue (${ANALYTICS_DAYS}d)`} icon={Wallet} value={kpis.revenue ? formatPrice(kpis.revenue) : "—"} accentVar="--av3-c5"
              info={<InfoButton title="Bundle revenue (30d)" description="Total basket value of all bundle-bearing orders on this location in the last 30 days."
                institutional="The scale check: penetration and AOV can both look healthy on tiny volume. This number tells you whether bundles are a rounding error or a real revenue line. Track its trend — flat revenue with rising discount means you're buying volume you already had."
                plain="If bundles drove 26,000 zł of baskets last month, that's the slice of revenue the ladder is touching. Pair it with the effective-discount KPI to see what you paid in markdown to earn it."
                tips="Grow it by lifting penetration (more carts see/accept the offer) before deepening discounts; promote a winning A/B variant chain-wide; schedule the family ladder for weekends when basket sizes are naturally larger."
                methodology="Sum of finalPriceGrosze across bundle orders from /api/admin/bundle-analytics (30d, this location), formatted in PLN." />} />
            <Kpi label="Avg discount" icon={Percent} value={kpis.avgDiscount == null ? "—" : `${kpis.avgDiscount.toFixed(1)}%`} accentVar="--av3-c1"
              info={<InfoButton title="Average effective discount" description="The blended markdown actually given on bundle orders — savings as a share of what the items would have cost separately."
                institutional="This is the cost of the ladder. Discipline says effective discount should stay below the contribution the attach creates; a sustainable QSR bundle gives ~8–18% off à-la-carte. Above ~25% you're likely cannibalising full-price orders rather than creating incremental ones (check the new-vs-repeat cohort split)."
                plain="If items priced separately would be 65 zł and the bundle sells for 55 zł, that's 10 zł / ~15% given away. Fine if those 55 zł baskets are extra — expensive if those customers would have spent 50 zł anyway."
                tips="Trim the headline % and add value instead (a free add-on slot reads as generous but costs you margin, not price); use split mains/add-ons discounts so you only mark down what you must; let the A/B experiment find the smallest discount that holds penetration."
                methodology="totalSavingsGrosze ÷ (totalRevenueGrosze + totalSavingsGrosze) from /api/admin/bundle-analytics (30d). Savings = refPrice − finalPrice summed across bundle orders." />} />
          </div>

          <div className="av3-toolbar">
            <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 240, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bundles…" />
            <span className="av3-toolbar-spacer" />
            <span className="av3-cell-muted" style={{ fontSize: 12 }}>{filtered.length} shown</span>
            <div className="av3-viewtoggle" role="tablist" aria-label="Bundle view">
              <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} aria-label="Board view" title="Board view"><LayoutGrid /></button>
              <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} aria-label="Table view" title="Table view"><Rows3 /></button>
            </div>
          </div>

          {usingDefaultBundles && (
            <div className="av3-edhint" style={{ marginBottom: 2 }}>
              Showing the default chain ladders (live on this location). Edit or toggle any tier to customise — your changes save as this location&rsquo;s override.
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="av3-card" style={{ padding: 0 }}>
              <div className="av3-empty"><div className="av3-empty-title">No bundles</div><div className="av3-empty-text">{q ? "No bundle matches that search." : "Add a bundle to start a ladder for this location."}</div></div>
            </div>
          ) : view === "table" ? (
            <div className="av3-card" style={{ padding: 0 }}>
              <Table columns={bundleCols} rows={filtered} rowKey={(b) => b.id} onRowClick={(b) => setEditBundle(b)} />
            </div>
          ) : (
            <BundleBoard bundles={filtered} statById={statById} saving={saving} onOpen={(b) => setEditBundle(b)} onToggle={toggleBundle} />
          )}

          <RulesCard rules={rules} onChange={(bundleRules) => patchConfig({ bundleRules })} />
          <ExperimentCard experiment={experiment} bundles={bundles} onChange={(exp) => patchConfig({ experiment: exp })} onPromote={promoteVariant} />
          <MLPanel location={loc} rolloutPct={cfg.mlUpsellRolloutPct ?? 0} onRollout={(mlUpsellRolloutPct) => patchConfig({ mlUpsellRolloutPct })} />
        </>
      )}

      {editBundle && <BundleDialog bundle={editBundle === "new" ? null : editBundle} city={city} stat={editBundle !== "new" ? statById.get((editBundle as Bundle).id) ?? null : null} onClose={() => setEditBundle(null)} onSave={(b) => { upsertBundle(b); setEditBundle(null); }} onDelete={editBundle !== "new" ? () => { removeBundle((editBundle as Bundle).id); setEditBundle(null); } : undefined} />}
    </>
  );
}

/* ── bundle board (card view) ──────────────────────────────────────────── */
function BundleBoard({ bundles, statById, saving, onOpen, onToggle }: {
  bundles: Bundle[]; statById: Map<string, BundleRollupLite>; saving: boolean; onOpen: (b: Bundle) => void; onToggle: (id: string) => void;
}) {
  const sections = useMemo(() => {
    const map = new Map<string, Bundle[]>();
    for (const b of bundles) { const k = mealKey(b.mealPeriod); const arr = map.get(k) ?? []; arr.push(b); map.set(k, arr); }
    const order = [...MEAL_ORDER, "other"];
    return order.filter((k) => map.has(k)).map((k) => ({ key: k, items: map.get(k)! }));
  }, [bundles]);

  return (
    <div>
      {sections.map((s) => (
        <div key={s.key}>
          <div className="av3-board-section">{MEAL_LABEL[s.key] ?? s.key}<span className="c">{s.items.length}</span></div>
          <div className="av3-board">
            {s.items.map((b) => {
              const stat = statById.get(b.id);
              const priceLabel = b.pricingMode === "dynamic" ? `${b.discountPercent ?? 0}% off` : formatPrice(b.priceGrosze ?? 0);
              return (
                <div key={b.id} className="av3-dcard" data-dim={!b.active} role="button" tabIndex={0}
                  onClick={() => onOpen(b)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(b); } }}>
                  <div className="av3-dcard-name">{b.tier ? <span style={{ color: "var(--av3-subtle)", fontWeight: 500 }}>{b.tier} · </span> : null}{b.name}</div>
                  <div className="av3-dcard-badges">
                    {b.isAnchor && <Badge tone="brand">anchor</Badge>}
                    {b.isDecoy && <Badge tone="neutral">decoy</Badge>}
                    {b.isDefault && <Badge tone="info">default</Badge>}
                    {b.membersOnly && <Badge tone="warn">members</Badge>}
                    {b.requiredTier && <Badge tone="warn">{b.requiredTier}</Badge>}
                    {stat && stat.thumbsDownRate >= 0.25 && stat.thumbsDown >= 2 && <Badge tone="bad">{Math.round(stat.thumbsDownRate * 100)}% 👎</Badge>}
                  </div>
                  <div className="av3-dcard-desc">{b.description || "—"}</div>
                  <div className="av3-dcard-foot">
                    <div>
                      <div className="av3-dcard-price">{priceLabel}
                        {b.pricingMode !== "dynamic" && b.refPriceGrosze ? <span style={{ fontSize: 11, color: "var(--av3-subtle)", textDecoration: "line-through", marginLeft: 5, fontWeight: 400 }}>{formatPrice(b.refPriceGrosze)}</span> : null}
                      </div>
                      <div className="av3-dcard-sub">{stat ? `${stat.count} sold · ${Math.round(stat.effectiveDiscount * 100)}% off (30d)` : "No 30d data"}</div>
                    </div>
                    <Switch checked={b.active} disabled={saving} label={b.active ? "Live" : "Paused"} onClick={(e) => e.stopPropagation()} onChange={() => onToggle(b.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── bundle rules ──────────────────────────────────────────────────────── */
function RulesCard({ rules, onChange }: { rules: BundleRules; onChange: (r: BundleRules) => void }) {
  return (
    <div className="av3-card" style={{ padding: 16 }}>
      <div className="av3-subhead" style={{ marginTop: 0 }}>Bundle rules</div>
      <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 10 }}>Lunch ladder is hour-gated; the Family ladder is quantity-gated.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Lunch start hr</span><input className="av3-input" type="number" min={0} max={23} value={rules.lunch.startHour} onChange={(e) => onChange({ ...rules, lunch: { ...rules.lunch, startHour: Number(e.target.value) || 0 } })} /></label>
        <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Lunch end hr</span><input className="av3-input" type="number" min={0} max={23} value={rules.lunch.endHour} onChange={(e) => onChange({ ...rules, lunch: { ...rules.lunch, endHour: Number(e.target.value) || 0 } })} /></label>
        <label className="av3-field" style={{ width: 130 }}><span className="av3-field-label">Family min mains</span><input className="av3-input" type="number" min={1} value={rules.family.minMainItems} onChange={(e) => onChange({ ...rules, family: { ...rules.family, minMainItems: Number(e.target.value) || 1 } })} /></label>
        <label className="av3-field" style={{ width: 130 }}><span className="av3-field-label">Hint within</span><input className="av3-input" type="number" min={0} value={rules.family.hintWithin} onChange={(e) => onChange({ ...rules, family: { ...rules.family, hintWithin: Number(e.target.value) || 0 } })} /></label>
      </div>
    </div>
  );
}

/* ── A/B experiment ────────────────────────────────────────────────────── */
function ExperimentCard({ experiment, bundles, onChange, onPromote }: { experiment: Experiment | null; bundles: Bundle[]; onChange: (e: Experiment | null) => void; onPromote: (variantId: string) => void }) {
  const create = () => onChange({ id: `exp-${Date.now()}`, name: "Discount A/B", active: false, status: "draft", primaryMetric: "contribution", variants: [{ id: "control", label: "Control", weight: 50 }, { id: "var-b", label: "Variant B", weight: 50 }], controlVariantId: "control" });
  if (!experiment) {
    return (
      <div className="av3-card" style={{ padding: 16 }}>
        <div className="av3-subhead" style={{ marginTop: 0 }}>Experiments (A/B)</div>
        <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 10 }}>Run a discount A/B on the dynamic bundles. Customers are phone-hashed to a variant for a stable offer.</div>
        <Button variant="secondary" size="sm" onClick={create}><Plus className="av3-btn-ico" /> New experiment</Button>
      </div>
    );
  }
  const update = (patch: Partial<Experiment>) => onChange({ ...experiment, ...patch });
  const patchVariant = (id: string, patch: Partial<ExpVariant>) => update({ variants: experiment.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  const addVariant = () => update({ variants: [...experiment.variants, { id: `var-${Date.now()}`, label: `Variant ${String.fromCharCode(65 + experiment.variants.length)}`, weight: 0 }] });
  const rmVariant = (id: string) => update({ variants: experiment.variants.filter((v) => v.id !== id) });
  const setOverride = (vid: string, bundleId: string, pct: string) => {
    const v = experiment.variants.find((x) => x.id === vid);
    if (!v) return;
    const ov = { ...(v.bundleOverrides ?? {}) };
    if (pct === "") delete ov[bundleId]; else ov[bundleId] = Number(pct) || 0;
    patchVariant(vid, { bundleOverrides: ov });
  };
  const running = (experiment.status ?? (experiment.active ? "running" : "draft")) === "running";

  return (
    <div className="av3-card" style={{ padding: 16 }}>
      <div className="av3-subhead" style={{ marginTop: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Experiment (A/B)</span>
        <span style={{ display: "flex", gap: 6 }}>
          <Badge tone={running ? "ok" : experiment.status === "stopped" ? "neutral" : "warn"}>{experiment.status ?? (experiment.active ? "running" : "draft")}</Badge>
          {running ? <Button variant="ghost" size="sm" onClick={() => update({ status: "stopped", active: false, stoppedAt: new Date().toISOString() })}>Stop</Button>
            : <Button variant="secondary" size="sm" onClick={() => update({ status: "running", active: true, startedAt: new Date().toISOString() })}>Start</Button>}
          <Button variant="danger" size="sm" onClick={() => onChange(null)}>Delete</Button>
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <label className="av3-field" style={{ flex: 1, minWidth: 180 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={experiment.name} onChange={(e) => update({ name: e.target.value })} /></label>
        <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Primary metric</span><select className="av3-select" value={experiment.primaryMetric ?? "contribution"} onChange={(e) => update({ primaryMetric: e.target.value as Experiment["primaryMetric"] })}><option value="contribution">Contribution</option><option value="aov">AOV</option><option value="conversion">Conversion</option></select></label>
        <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Control variant</span><select className="av3-select" value={experiment.controlVariantId ?? ""} onChange={(e) => update({ controlVariantId: e.target.value })}>{experiment.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
      </div>
      {experiment.variants.map((v) => (
        <div key={v.id} style={{ border: "1px solid var(--av3-line)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ flex: 1, minWidth: 140 }}><span className="av3-field-label">Variant label</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={v.label} onChange={(e) => patchVariant(v.id, { label: e.target.value })} /></label>
            <label className="av3-field" style={{ width: 90 }}><span className="av3-field-label">Weight</span><input className="av3-input" type="number" min={0} value={v.weight} onChange={(e) => patchVariant(v.id, { weight: Number(e.target.value) || 0 })} /></label>
            <Button variant="ghost" size="sm" onClick={() => onPromote(v.id)} title="Copy this variant's discounts to live bundles + conclude">Promote</Button>
            <button type="button" className="av3-iconbtn-sm" aria-label="Remove variant" onClick={() => rmVariant(v.id)} disabled={experiment.variants.length <= 2}><Trash2 /></button>
          </div>
          {bundles.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="av3-field-label" style={{ display: "block", marginBottom: 4 }}>Per-bundle discount % override (blank = inherit)</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {bundles.map((b) => {
                  const cur = v.bundleOverrides?.[b.id];
                  const val = cur === undefined ? "" : typeof cur === "number" ? String(cur) : String(cur.discountPercent ?? "");
                  return <label className="av3-field" style={{ width: 130 }} key={b.id}><span className="av3-field-label" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.tier || b.name}</span><input className="av3-input" type="number" value={val} placeholder="—" onChange={(e) => setOverride(v.id, b.id, e.target.value)} /></label>;
                })}
              </div>
            </div>
          )}
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={addVariant}><Plus className="av3-btn-ico" /> Add variant</Button>
    </div>
  );
}

/* ── ML ranker panel ───────────────────────────────────────────────────── */
interface MLModel { locationSlug: string; trainedAt: string; sampleCount: number; positiveRate: number; logLoss: number }
interface ArmStat { orders: number; attachRate: number; avgOrderValueGrosze: number }
interface Compare { ready: boolean; reason?: string; rolloutPct?: number; ml?: ArmStat; rules?: ArmStat; decision?: unknown }

function MLPanel({ location, rolloutPct, onRollout }: { location: string; rolloutPct: number; onRollout: (pct: number) => void }) {
  const [model, setModel] = useState<MLModel | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [training, setTraining] = useState(false);
  const [draft, setDraft] = useState(rolloutPct);
  useEffect(() => { setDraft(rolloutPct); }, [rolloutPct]);

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([
      fetch("/api/admin/ml-upsell").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/ml-upsell/compare?location=${location}&days=30`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const models: MLModel[] = s?.models ?? [];
    setModel(models.find((m) => m.locationSlug === location) ?? null);
    setCompare(c);
  }, [location]);
  useEffect(() => { refresh(); }, [refresh]);

  const train = async () => {
    setTraining(true);
    try { await fetch("/api/admin/ml-upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location, days: 180 }) }); await refresh(); }
    finally { setTraining(false); }
  };
  const decisionText = typeof compare?.decision === "string" ? compare.decision : (compare?.decision as { recommendation?: string; label?: string } | undefined)?.recommendation ?? (compare?.decision as { label?: string } | undefined)?.label ?? null;

  return (
    <div className="av3-card" style={{ padding: 16 }}>
      <div className="av3-subhead" style={{ marginTop: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>ML cross-sell ranker</span>
        <Button variant="secondary" size="sm" loading={training} onClick={train}>Train now</Button>
      </div>
      <div className="av3-od-grid" style={{ marginBottom: 12 }}>
        <div className="av3-od-field"><div className="k">Model</div><div className="v">{model ? <Badge tone="ok" dot>trained</Badge> : <Badge tone="warn">none</Badge>}</div></div>
        <div className="av3-od-field"><div className="k">Trained</div><div className="v" style={{ fontSize: 12 }}>{model ? new Date(model.trainedAt).toLocaleDateString("pl-PL") : "—"}</div></div>
        <div className="av3-od-field"><div className="k">Samples</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{model?.sampleCount ?? "—"}</div></div>
        <div className="av3-od-field"><div className="k">Log loss</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{model ? model.logLoss.toFixed(3) : "—"}</div></div>
      </div>

      <span className="av3-field-label" style={{ display: "block", marginBottom: 4 }}>ML rollout — {draft}% of customers (phone-bucketed)</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input type="range" min={0} max={100} step={5} value={draft} onChange={(e) => setDraft(Number(e.target.value))} onMouseUp={() => onRollout(draft)} onTouchEnd={() => onRollout(draft)} style={{ flex: 1 }} />
        <span className="mono" style={{ fontFamily: "var(--av3-mono)", width: 44, textAlign: "right" }}>{draft}%</span>
      </div>
      <div className="av3-cell-muted" style={{ fontSize: 10.5, marginTop: 4 }}>Falls back to the rules ranker when no model exists or rollout is 0.</div>

      {compare?.ready && compare.ml && compare.rules ? (
        <>
          <div className="av3-subhead">ML vs rules (30d, rollout stable)</div>
          <Table
            columns={[
              { key: "arm", header: "Arm", render: (r: { arm: string; s: ArmStat }) => <span style={{ fontWeight: 600 }}>{r.arm}</span> },
              { key: "orders", header: "Orders", num: true, render: (r) => <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{r.s.orders}</span> },
              { key: "attach", header: "Attach", num: true, render: (r) => <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{(r.s.attachRate * 100).toFixed(1)}%</span> },
              { key: "aov", header: "AOV", num: true, render: (r) => <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(r.s.avgOrderValueGrosze)}</span> },
            ]}
            rows={[{ arm: "ML", s: compare.ml }, { arm: "Rules", s: compare.rules }]}
            rowKey={(r) => r.arm}
          />
          {decisionText && <div style={{ fontSize: 11.5, color: "var(--av3-muted)", marginTop: 6 }}>Decision: <b style={{ color: "var(--av3-fg)" }}>{decisionText}</b></div>}
        </>
      ) : (
        <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 10 }}>{compare?.reason === "no_model" ? "Train a model to enable the comparison." : compare?.reason === "rollout_off" ? "Turn up the rollout to start collecting an ML arm." : "Not enough data for a comparison yet."}</div>
      )}
    </div>
  );
}

/* ── read-only modifier inventory ──────────────────────────────────────── */
function ModifierInventory({ menusByLoc, locations }: { menusByLoc: Record<string, MenuItemLite[]>; locations: { slug: string; city: string }[] }) {
  return (
    <>
      {locations.map((l) => {
        const items = (menusByLoc[l.slug] ?? []).filter((m) => (m.modifierGroups?.length ?? 0) > 0);
        return (
          <div className="av3-card" style={{ padding: 16 }} key={l.slug}>
            <div className="av3-subhead" style={{ marginTop: 0 }}>{l.city} — items with modifiers ({items.length})</div>
            {items.length === 0 ? (
              <div className="av3-cell-muted" style={{ fontSize: 11.5 }}>No items carry modifier groups. Add them on the Menu editor.</div>
            ) : (
              items.map((m) => (
                <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{m.name}</div>
                  {(m.modifierGroups ?? []).map((g) => (
                    <div key={g.id} style={{ fontSize: 11.5, color: "var(--av3-muted)", marginTop: 2 }}>
                      <b>{g.label}</b> <span style={{ color: "var(--av3-subtle)" }}>(pick {g.minSelections ?? 0}–{g.maxSelections ?? 1})</span> · {(g.options ?? []).map((o) => `${o.label}${o.priceDelta ? ` +${formatPrice(o.priceDelta)}` : ""}`).join(", ")}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        );
      })}
      <div className="av3-cell-muted" style={{ fontSize: 11.5 }}>Read-only reference. Edit modifier groups on the Menu editor (chain-wide, rule #10).</div>
    </>
  );
}

/* ── live customer-facing bundle preview ───────────────────────────────── */
function BundlePreview({ tier, name, description, composition, pricingMode, priceGrosze, refPriceGrosze, discountPercent, isAnchor, isDecoy, membersOnly, requiredTier }: {
  tier: string; name: string; description: string; composition: BundleSlot[];
  pricingMode: "fixed" | "dynamic"; priceGrosze: number; refPriceGrosze: number; discountPercent: number;
  isAnchor: boolean; isDecoy: boolean; membersOnly: boolean; requiredTier: string;
}) {
  const savings = pricingMode === "fixed" ? Math.max(0, refPriceGrosze - priceGrosze) : 0;
  const savingsPct = pricingMode === "fixed" && refPriceGrosze > 0 ? Math.round((savings / refPriceGrosze) * 100) : 0;
  return (
    <div style={{ border: `1px solid ${isAnchor ? "color-mix(in oklab, var(--av3-platinum) 45%, var(--av3-line-strong))" : "var(--av3-line)"}`, borderRadius: "var(--av3-r-lg)", background: "var(--av3-s1)", padding: 14, boxShadow: "var(--av3-sh-1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        {tier && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--av3-platinum)" }}>{tier}</span>}
        {isAnchor && <Badge tone="brand">Best value</Badge>}
        {isDecoy && <Badge tone="neutral">decoy</Badge>}
        {membersOnly && <Badge tone="warn">Members</Badge>}
        {requiredTier && <Badge tone="warn">{requiredTier}+</Badge>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{name || "Bundle name"}</div>
      {description && <div style={{ fontSize: 12, color: "var(--av3-muted)", marginTop: 3, lineHeight: 1.4 }}>{description}</div>}
      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {composition.filter((s) => s.quantity > 0).map((s, i) => (
          <li key={i} style={{ fontSize: 12, color: "var(--av3-fg)", display: "flex", gap: 7 }}>
            <span style={{ fontFamily: "var(--av3-mono)", color: "var(--av3-platinum)" }}>{s.quantity}×</span>
            <span style={{ textTransform: "capitalize" }}>{s.kind === "category" ? s.category : (s.itemIdSuffix || "item")}</span>
          </li>
        ))}
        {composition.filter((s) => s.quantity > 0).length === 0 && <li style={{ fontSize: 11.5, color: "var(--av3-subtle)" }}>Add a composition slot…</li>}
      </ul>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--av3-line)", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        {pricingMode === "fixed" ? (
          <>
            <span style={{ fontFamily: "var(--av3-mono)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>{formatPrice(priceGrosze)}</span>
            {refPriceGrosze > priceGrosze && <span style={{ fontFamily: "var(--av3-mono)", fontSize: 12.5, color: "var(--av3-subtle)", textDecoration: "line-through" }}>{formatPrice(refPriceGrosze)}</span>}
            {savings > 0 && <Badge tone="ok">Save {formatPrice(savings)}{savingsPct ? ` · ${savingsPct}%` : ""}</Badge>}
          </>
        ) : (
          <>
            <span style={{ fontFamily: "var(--av3-mono)", fontSize: 20, fontWeight: 700 }}>{discountPercent}% off</span>
            <span style={{ fontSize: 11.5, color: "var(--av3-muted)" }}>builds dynamically from the cart</span>
          </>
        )}
      </div>
      <div style={{ marginTop: 10, height: 30, borderRadius: "var(--av3-r-pill)", background: "color-mix(in oklab, var(--av3-platinum) 16%, var(--av3-s2))", color: "var(--av3-fg)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>Add bundle to cart</div>
    </div>
  );
}

/** This-bundle live stats from the 30-day analytics rollup (real data). */
function BundleStats({ stat }: { stat: BundleRollupLite | null }) {
  if (!stat || stat.count === 0) {
    return <div className="av3-edhint" style={{ marginTop: 12 }}>No sales recorded for this bundle in the last {ANALYTICS_DAYS} days yet — stats appear here once it sells.</div>;
  }
  const cells: { k: string; v: string; tone?: "bad" }[] = [
    { k: `${ANALYTICS_DAYS}d sold`, v: String(stat.count) },
    { k: "Avg ticket", v: formatPrice(stat.avgFinalGrosze) },
    { k: "Avg saving", v: formatPrice(stat.avgSavingsGrosze) },
    { k: "Eff. discount", v: `${Math.round(stat.effectiveDiscount * 100)}%` },
    { k: "Revenue", v: formatPrice(stat.totalRevenueGrosze) },
    { k: "👍 / 👎", v: `${stat.thumbsUp} / ${stat.thumbsDown}`, ...(stat.thumbsDownRate >= 0.25 && stat.thumbsDown >= 2 ? { tone: "bad" as const } : {}) },
  ];
  return (
    <div style={{ marginTop: 12 }}>
      <div className="av3-field-label" style={{ marginBottom: 6 }}>Live performance · last {ANALYTICS_DAYS} days</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--av3-line)", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-md)", overflow: "hidden" }}>
        {cells.map((c) => (
          <div key={c.k} style={{ background: "var(--av3-s1)", padding: "8px 10px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--av3-subtle)" }}>{c.k}</div>
            <div className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 14, fontWeight: 600, marginTop: 2, color: c.tone === "bad" ? "var(--av3-bad)" : "var(--av3-fg)" }}>{c.v}</div>
          </div>
        ))}
      </div>
      {stat.refundRate > 0 && <div className="av3-cell-muted" style={{ fontSize: 11, marginTop: 6 }}>Refund rate: {Math.round(stat.refundRate * 100)}% of these orders saw a refund.</div>}
    </div>
  );
}

/* ── bundle editor dialog (workbench: form + live preview) ─────────────── */
function BundleDialog({ bundle, city, stat, onClose, onSave, onDelete }: { bundle: Bundle | null; city: string; stat: BundleRollupLite | null; onClose: () => void; onSave: (b: Bundle) => void; onDelete?: () => void }) {
  const [tier, setTier] = useState(bundle?.tier ?? "");
  const [name, setName] = useState(bundle?.name ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [mealPeriod, setMealPeriod] = useState(bundle?.mealPeriod ?? "lunch");
  const [pricingMode, setPricingMode] = useState<"fixed" | "dynamic">(bundle?.pricingMode ?? "fixed");
  const [price, setPrice] = useState(String((bundle?.priceGrosze ?? 0) / 100));
  const [refPrice, setRefPrice] = useState(String((bundle?.refPriceGrosze ?? 0) / 100));
  const [discount, setDiscount] = useState(String(bundle?.discountPercent ?? 0));
  // Split-discount round-trip (v2 parity): the default dynamic bundles
  // (Family, Family Feast, Feast Deluxe, Late dinner/Party, Pantry Pack)
  // carry separate mains/add-ons %s. Blank = inherit the blended discount.
  const [mainsDiscount, setMainsDiscount] = useState(bundle?.mainsDiscountPercent != null ? String(bundle.mainsDiscountPercent) : "");
  const [addOnsDiscount, setAddOnsDiscount] = useState(bundle?.addOnsDiscountPercent != null ? String(bundle.addOnsDiscountPercent) : "");
  const [minMains, setMinMains] = useState(String(bundle?.minMains ?? 3));
  const [maxMains, setMaxMains] = useState(String(bundle?.maxMains ?? 0));
  const [mainCategories, setMainCategories] = useState((bundle?.mainCategories ?? ["pizza", "pasta"]).join(", "));
  const [requiredTier, setRequiredTier] = useState<string>(bundle?.requiredTier ?? "");
  const [channel, setChannel] = useState<string>(bundle?.channel ?? "");
  const [membersOnly, setMembersOnly] = useState(Boolean(bundle?.membersOnly));
  const [limitedUntil, setLimitedUntil] = useState(bundle?.limitedUntil ?? "");
  const [activeDays, setActiveDays] = useState<string[]>(bundle?.activeDays ?? []);
  const [isAnchor, setIsAnchor] = useState(Boolean(bundle?.isAnchor));
  const [isDecoy, setIsDecoy] = useState(Boolean(bundle?.isDecoy));
  const [isDefault, setIsDefault] = useState(Boolean(bundle?.isDefault));
  const [active, setActive] = useState(bundle?.active ?? true);
  const [composition, setComposition] = useState<BundleSlot[]>(bundle?.composition ?? [{ kind: "category", category: "pizza", quantity: 1 }]);

  const toggleDay = (d: string) => setActiveDays((a) => (a.includes(d) ? a.filter((x) => x !== d) : [...a, d]));
  const setSlot = (i: number, patch: Partial<BundleSlot>) => setComposition((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addSlot = () => setComposition((arr) => [...arr, { kind: "category", category: "pizza", quantity: 1 }]);
  const rmSlot = (i: number) => setComposition((arr) => arr.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!name.trim()) return;
    const b: Bundle = {
      id: bundle?.id ?? `bundle-${Date.now()}`,
      tier: tier.trim(), name: name.trim(), description: description.trim(), mealPeriod,
      composition: composition.filter((s) => s.quantity > 0),
      pricingMode,
      active, isAnchor, isDecoy, isDefault, membersOnly,
      ...(pricingMode === "fixed"
        ? { priceGrosze: Math.round((Number(price) || 0) * 100), refPriceGrosze: Math.round((Number(refPrice) || 0) * 100) }
        : { discountPercent: Math.max(0, Math.min(50, Number(discount) || 0)), minMains: Number(minMains) || 1, ...(Number(maxMains) > 0 ? { maxMains: Number(maxMains) } : {}), mainCategories: mainCategories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean), ...(mainsDiscount.trim() !== "" ? { mainsDiscountPercent: Math.max(0, Math.min(50, Number(mainsDiscount) || 0)) } : {}), ...(addOnsDiscount.trim() !== "" ? { addOnsDiscountPercent: Math.max(0, Math.min(50, Number(addOnsDiscount) || 0)) } : {}) }),
      ...(requiredTier ? { requiredTier: requiredTier as "gold" | "platinum" } : {}),
      ...(channel ? { channel: channel as "dine-in" | "delivery" } : {}),
      ...(limitedUntil ? { limitedUntil } : {}),
      ...(activeDays.length > 0 ? { activeDays } : {}),
    };
    onSave(b);
  };

  return (
    <Dialog open onClose={onClose} title={bundle ? bundle.name : "New bundle"} subtitle={`${city} · bundle ladder tier`} width={940}
      footer={<>{onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!name.trim()} onClick={submit}>Save</Button></>}>
      <div className="av3-bodysplit">
        <div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Tier</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={tier} onChange={(e) => setTier(e.target.value)} placeholder="Solo / Lunch+" /></label>
            <label className="av3-field" style={{ flex: 1, minWidth: 160 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="av3-field" style={{ width: 130 }}><span className="av3-field-label">Meal period</span><select className="av3-select" value={mealPeriod} onChange={(e) => setMealPeriod(e.target.value)}><option value="lunch">lunch</option><option value="family">family</option><option value="lateNight">lateNight</option></select></label>
          </div>
          <div className="av3-field" style={{ marginTop: 10 }}><span className="av3-field-label">Description</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={description} onChange={(e) => setDescription(e.target.value)} /></div>

          <div className="av3-subhead">Pricing</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label className="av3-field" style={{ width: 130 }}><span className="av3-field-label">Mode</span><select className="av3-select" value={pricingMode} onChange={(e) => setPricingMode(e.target.value as "fixed" | "dynamic")}><option value="fixed">Fixed price</option><option value="dynamic">Dynamic %</option></select></label>
            {pricingMode === "fixed" ? (
              <>
                <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Price (zł)</span><input className="av3-input" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
                <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Ref price (zł)</span><input className="av3-input" type="number" step="0.01" value={refPrice} onChange={(e) => setRefPrice(e.target.value)} /></label>
              </>
            ) : (
              <>
                <label className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Blended %</span><input className="av3-input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
                <label className="av3-field" style={{ width: 100 }}><span className="av3-field-label">Mains %</span><input className="av3-input" type="number" value={mainsDiscount} onChange={(e) => setMainsDiscount(e.target.value)} placeholder="blend" /></label>
                <label className="av3-field" style={{ width: 100 }}><span className="av3-field-label">Add-ons %</span><input className="av3-input" type="number" value={addOnsDiscount} onChange={(e) => setAddOnsDiscount(e.target.value)} placeholder="blend" /></label>
                <label className="av3-field" style={{ width: 100 }}><span className="av3-field-label">Min mains</span><input className="av3-input" type="number" value={minMains} onChange={(e) => setMinMains(e.target.value)} /></label>
                <label className="av3-field" style={{ width: 100 }}><span className="av3-field-label">Max mains</span><input className="av3-input" type="number" value={maxMains} onChange={(e) => setMaxMains(e.target.value)} placeholder="∞" /></label>
                <label className="av3-field" style={{ flex: 1, minWidth: 140 }}><span className="av3-field-label">Main categories</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={mainCategories} onChange={(e) => setMainCategories(e.target.value)} /></label>
              </>
            )}
          </div>

          <div className="av3-subhead">Composition</div>
          <div className="av3-reciperow-head" style={{ gridTemplateColumns: "110px 1fr 70px 28px" }}><span>Kind</span><span>Category / item suffix</span><span>Qty</span><span /></div>
          {composition.map((s, i) => (
            <div key={i} className="av3-reciperow" style={{ gridTemplateColumns: "110px 1fr 70px 28px", padding: "3px 0", borderBottom: "none" }}>
              <select className="av3-select" value={s.kind} onChange={(e) => setSlot(i, { kind: e.target.value as "category" | "item" })}><option value="category">Category</option><option value="item">Item</option></select>
              {s.kind === "category" ? (
                <select className="av3-select" value={s.category ?? "pizza"} onChange={(e) => setSlot(i, { category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              ) : (
                <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={s.itemIdSuffix ?? ""} onChange={(e) => setSlot(i, { itemIdSuffix: e.target.value })} placeholder="e.g. anti-bruschetta" />
              )}
              <input className="av3-input" type="number" min={1} value={s.quantity} onChange={(e) => setSlot(i, { quantity: Number(e.target.value) || 1 })} />
              <button type="button" className="av3-iconbtn-sm" aria-label="Remove slot" onClick={() => rmSlot(i)}><Trash2 /></button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addSlot} style={{ marginTop: 6 }}><Plus className="av3-btn-ico" /> Add slot</Button>

          <div className="av3-subhead">Gating &amp; framing</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <label className="av3-field" style={{ width: 130 }}><span className="av3-field-label">Loyalty gate</span><select className="av3-select" value={requiredTier} onChange={(e) => setRequiredTier(e.target.value)}><option value="">None</option><option value="gold">Gold</option><option value="platinum">Platinum</option></select></label>
            <label className="av3-field" style={{ width: 130 }}><span className="av3-field-label">Channel</span><select className="av3-select" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Both</option><option value="dine-in">Dine-in</option><option value="delivery">Delivery</option></select></label>
            <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Limited until</span><input className="av3-input" type="date" value={limitedUntil} onChange={(e) => setLimitedUntil(e.target.value)} /></label>
            <div className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Members-only</span><Switch aria-label="Members-only" checked={membersOnly} onChange={setMembersOnly} /></div>
          </div>
          <span className="av3-field-label" style={{ display: "block", marginBottom: 4 }}>Active days (none = all week)</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {DAYS.map((d) => <button key={d} type="button" className="av3-badge" onClick={() => toggleDay(d)} style={{ cursor: "pointer", border: `1px solid ${activeDays.includes(d) ? "var(--av3-platinum)" : "var(--av3-line-strong)"}`, background: activeDays.includes(d) ? "color-mix(in oklab, var(--av3-platinum) 18%, var(--av3-s1))" : "transparent", color: activeDays.includes(d) ? "var(--av3-fg)" : "var(--av3-muted)" }}>{d.slice(0, 3)}</button>)}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={isAnchor} onChange={(e) => setIsAnchor(e.target.checked)} /> Anchor</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={isDecoy} onChange={(e) => setIsDecoy(e.target.checked)} /> Decoy</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Default</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
          </div>
        </div>

        <div style={{ position: "sticky", top: 0 }}>
          <div className="av3-field-label" style={{ marginBottom: 6 }}>Customer preview · live</div>
          <BundlePreview
            tier={tier} name={name} description={description} composition={composition}
            pricingMode={pricingMode}
            priceGrosze={Math.round((Number(price) || 0) * 100)}
            refPriceGrosze={Math.round((Number(refPrice) || 0) * 100)}
            discountPercent={Math.max(0, Math.min(50, Number(discount) || 0))}
            isAnchor={isAnchor} isDecoy={isDecoy} membersOnly={membersOnly} requiredTier={requiredTier}
          />
          <BundleStats stat={stat} />
        </div>
      </div>
    </Dialog>
  );
}
