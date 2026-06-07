"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { DEFAULT_BUNDLES } from "@/lib/bundles";
import type { MenuCategory, ModifierGroup } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, type ColumnV3, Dialog, SkeletonRows, Switch, Table } from "./ui";

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

const CATEGORIES: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT_RULES: BundleRules = { lunch: { startHour: 11, endHour: 14 }, family: { minMainItems: 3, hintWithin: 1 } };

export function UpsellV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [settings, setSettings] = useState<Settings>({});
  const [menusByLoc, setMenusByLoc] = useState<Record<string, MenuItemLite[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"bundles" | "modifiers">("bundles");
  const [editBundle, setEditBundle] = useState<Bundle | "new" | null>(null);

  const load = useCallback(async () => {
    const [s, ...menus] = await Promise.all([
      fetch("/api/admin/upsell").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ...all.map((l) => fetch(`/api/admin/menu?location=${l.slug}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])),
    ]);
    setSettings((s && typeof s === "object" ? s : {}) as Settings);
    const map: Record<string, MenuItemLite[]> = {};
    all.forEach((l, i) => { map[l.slug] = Array.isArray(menus[i]) ? menus[i] : []; });
    setMenusByLoc(map);
    setLoading(false);
  }, [all]);
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
        <button type="button" className={`av3-fchip ${tab === "bundles" ? "is-active" : ""}`} onClick={() => setTab("bundles")}>Bundles</button>
        <button type="button" className={`av3-fchip ${tab === "modifiers" ? "is-active" : ""}`} onClick={() => setTab("modifiers")}>Item modifiers</button>
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : tab === "modifiers" ? (
        <ModifierInventory menusByLoc={menusByLoc} locations={all} />
      ) : (
        <>
          <div className="av3-card" style={{ padding: 0 }}>
            {usingDefaultBundles && (
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--av3-line)", fontSize: 11.5, color: "var(--av3-muted)" }}>
                Showing the default chain ladders (live on this location). Edit or toggle any tier to customise — your changes save as this location&rsquo;s override.
              </div>
            )}
            {bundles.length === 0 ? (
              <div className="av3-empty"><div className="av3-empty-title">No bundles</div><div className="av3-empty-text">Add a bundle to start a ladder for this location.</div></div>
            ) : (
              <Table columns={bundleCols} rows={bundles} rowKey={(b) => b.id} onRowClick={(b) => setEditBundle(b)} />
            )}
          </div>

          <RulesCard rules={rules} onChange={(bundleRules) => patchConfig({ bundleRules })} />
          <ExperimentCard experiment={experiment} bundles={bundles} onChange={(exp) => patchConfig({ experiment: exp })} onPromote={promoteVariant} />
          <MLPanel location={loc} rolloutPct={cfg.mlUpsellRolloutPct ?? 0} onRollout={(mlUpsellRolloutPct) => patchConfig({ mlUpsellRolloutPct })} />
        </>
      )}

      {editBundle && <BundleDialog bundle={editBundle === "new" ? null : editBundle} city={city} onClose={() => setEditBundle(null)} onSave={(b) => { upsertBundle(b); setEditBundle(null); }} onDelete={editBundle !== "new" ? () => { removeBundle((editBundle as Bundle).id); setEditBundle(null); } : undefined} />}
    </>
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

/* ── bundle editor dialog ──────────────────────────────────────────────── */
function BundleDialog({ bundle, city, onClose, onSave, onDelete }: { bundle: Bundle | null; city: string; onClose: () => void; onSave: (b: Bundle) => void; onDelete?: () => void }) {
  const [tier, setTier] = useState(bundle?.tier ?? "");
  const [name, setName] = useState(bundle?.name ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [mealPeriod, setMealPeriod] = useState(bundle?.mealPeriod ?? "lunch");
  const [pricingMode, setPricingMode] = useState<"fixed" | "dynamic">(bundle?.pricingMode ?? "fixed");
  const [price, setPrice] = useState(String((bundle?.priceGrosze ?? 0) / 100));
  const [refPrice, setRefPrice] = useState(String((bundle?.refPriceGrosze ?? 0) / 100));
  const [discount, setDiscount] = useState(String(bundle?.discountPercent ?? 0));
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
        : { discountPercent: Math.max(0, Math.min(50, Number(discount) || 0)), minMains: Number(minMains) || 1, ...(Number(maxMains) > 0 ? { maxMains: Number(maxMains) } : {}), mainCategories: mainCategories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) }),
      ...(requiredTier ? { requiredTier: requiredTier as "gold" | "platinum" } : {}),
      ...(channel ? { channel: channel as "dine-in" | "delivery" } : {}),
      ...(limitedUntil ? { limitedUntil } : {}),
      ...(activeDays.length > 0 ? { activeDays } : {}),
    };
    onSave(b);
  };

  return (
    <Dialog open onClose={onClose} title={bundle ? bundle.name : "New bundle"} subtitle={`${city} · bundle ladder tier`} width={640}
      footer={<>{onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!name.trim()} onClick={submit}>Save</Button></>}>
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
            <label className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Discount %</span><input className="av3-input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
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
    </Dialog>
  );
}
