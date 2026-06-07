"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { DEFAULT_COMBO_DEALS, DEFAULT_TIME_WINDOWS } from "@/lib/upsell";
import type { MenuCategory, MenuRole } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, type ColumnV3, Dialog, SkeletonRows, Switch, Table } from "./ui";

interface RequiredItem { suffix: string; label: string }
interface Combo {
  id: string;
  name: string;
  description: string;
  categories: string[];
  discountPercent: number;
  minItems: number;
  active: boolean;
  channel?: "dine-in" | "delivery";
  /** Specific-item gating (Italian Classic Deal pattern). Mirrors
   *  ComboDeal.requiredItems — when set, every suffix must be in the cart
   *  for the combo to fire. Round-tripped through edits so it isn't lost. */
  requiredItems?: RequiredItem[];
}
interface TimeWindow {
  id: string; variant: string; startHour: number; endHour: number;
  title: string; sub: string; badge: string; cta: string; addItemIdSuffix?: string; active: boolean;
}
interface LocationConfig {
  combos?: Combo[];
  timeWindows?: TimeWindow[];
  preferredCoffee?: string; preferredDessert?: string; preferredDrink?: string; preferredGarlicBread?: string;
  heroItems?: string[]; pizzaioloChoiceItems?: string[]; chefSignatureItems?: string[];
  newItems?: string[]; popularItems?: string[]; staffPicks?: string[];
  [k: string]: unknown;
}
type Settings = Record<string, LocationConfig>;
interface MenuItemLite { id: string; name: string; category: MenuCategory; menuRole?: MenuRole }

type TabKey = "pairings" | "combos" | "timeOfDay" | "badges";
const TABS: { key: TabKey; label: string }[] = [
  { key: "pairings", label: "Cart pairings" }, { key: "combos", label: "Combo deals" },
  { key: "timeOfDay", label: "Time-of-day" }, { key: "badges", label: "Menu badges" },
];
const TIME_VARIANTS = ["morning", "lunch", "afternoon", "dinner", "late"];

// Mirror v2 (getDefaultConfig + TimeWindowsEditor): when a location has no
// saved combos / windows, show the canonical defaults the runtime serves
// (DEFAULT_COMBO_DEALS / DEFAULT_TIME_WINDOWS) so the board isn't blank for
// the live deals. Editing/toggling one materialises the full list (PUT).
const DEFAULT_COMBOS: Combo[] = DEFAULT_COMBO_DEALS.map((c) => ({
  id: c.id, name: c.name, description: c.description,
  categories: [...c.categories], discountPercent: c.discountPercent,
  minItems: c.minItems, active: true,
  ...(c.requiredItems ? { requiredItems: c.requiredItems.map((r) => ({ ...r })) } : {}),
  ...(c.channel ? { channel: c.channel } : {}),
}));
const DEFAULT_WINDOWS: TimeWindow[] = DEFAULT_TIME_WINDOWS.map((w) => ({
  id: w.id, variant: w.variant, startHour: w.startHour, endHour: w.endHour,
  title: w.title, sub: w.sub, badge: w.badge, cta: w.cta,
  addItemIdSuffix: w.addItemId ?? "", active: true,
}));

export function CrossSellV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [settings, setSettings] = useState<Settings>({});
  const [menu, setMenu] = useState<MenuItemLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("pairings");
  const [edit, setEdit] = useState<Combo | "new" | null>(null);
  const [editWin, setEditWin] = useState<TimeWindow | "new" | null>(null);

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([
      fetch("/api/admin/upsell").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(`/api/admin/menu?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setSettings((s && typeof s === "object" ? s : {}) as Settings);
    setMenu((Array.isArray(m) ? m : []) as MenuItemLite[]);
    setLoading(false);
  }, [loc]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const cfg = settings[loc] ?? {};
  const usingDefaultCombos = !cfg.combos || cfg.combos.length === 0;
  const combos = (usingDefaultCombos ? DEFAULT_COMBOS : cfg.combos) as Combo[];
  const usingDefaultWindows = !cfg.timeWindows || cfg.timeWindows.length === 0;
  const windows = (usingDefaultWindows ? DEFAULT_WINDOWS : cfg.timeWindows) as TimeWindow[];

  // Round-trip the FULL location config so nothing else is lost on a partial edit.
  const patchConfig = async (patch: Partial<LocationConfig>) => {
    const config = { ...cfg, ...patch };
    setSettings((s) => ({ ...s, [loc]: config }));
    setSaving(true);
    try {
      await fetch("/api/admin/upsell", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationSlug: loc, config }) });
    } finally { setSaving(false); }
  };

  const saveCombos = (next: Combo[]) => patchConfig({ combos: next });
  const toggleCombo = (id: string) => saveCombos(combos.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
  const upsertCombo = (combo: Combo) => saveCombos(combos.some((c) => c.id === combo.id) ? combos.map((c) => (c.id === combo.id ? combo : c)) : [...combos, combo]);
  const removeCombo = (id: string) => saveCombos(combos.filter((c) => c.id !== id));

  const saveWindows = (next: TimeWindow[]) => patchConfig({ timeWindows: next });
  const upsertWindow = (w: TimeWindow) => saveWindows(windows.some((x) => x.id === w.id) ? windows.map((x) => (x.id === w.id ? w : x)) : [...windows, w]);
  const removeWindow = (id: string) => saveWindows(windows.filter((x) => x.id !== id));

  const comboCols: ColumnV3<Combo>[] = [
    { key: "name", header: "Combo", render: (c) => (
      <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {c.name}{c.requiredItems && c.requiredItems.length > 0 ? <Badge tone="neutral">{c.requiredItems.length} req. items</Badge> : null}
      </span>
    ) },
    { key: "cats", header: "Categories", render: (c) => <span className="av3-cell-muted">{c.categories.join(" + ") || "—"}</span> },
    { key: "disc", header: "Discount", num: true, render: (c) => `${c.discountPercent}%` },
    { key: "min", header: "Min items", num: true, render: (c) => `${c.minItems}` },
    { key: "ch", header: "Channel", render: (c) => <span className="av3-cell-muted">{c.channel ?? "both"}</span> },
    { key: "act", header: "", render: (c) => <Switch checked={c.active} disabled={saving} label={c.active ? "Live" : "Off"} onClick={(e) => e.stopPropagation()} onChange={() => toggleCombo(c.id)} /> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Cross-sell</h1>
          <div className="av3-pagehead-sub">Pairings · combos · time-of-day · badges — {city}{!location ? " (pick a location to switch)" : ""}{saving ? " · saving…" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          {tab === "combos" && <Button variant="primary" size="sm" onClick={() => setEdit("new")}><Plus className="av3-btn-ico" /> Add combo</Button>}
          {tab === "timeOfDay" && <Button variant="primary" size="sm" onClick={() => setEditWin("new")}><Plus className="av3-btn-ico" /> Add window</Button>}
        </div>
      </div>

      <div className="av3-filterchips">
        {TABS.map((t) => <button key={t.key} type="button" className={`av3-fchip ${tab === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : tab === "pairings" ? (
        <div className="av3-card" style={{ padding: 16 }}>
          <div className="av3-subhead" style={{ marginTop: 0 }}>Complete your meal — four fixed cart slots</div>
          <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 12 }}>Shown as a horizontal slider above the cart subtotal: Coffee → Dessert → Side → Drink.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
            <ItemSelect label="Slot 1 · Coffee" items={menu.filter((m) => m.category === "drinks")} value={cfg.preferredCoffee ?? ""} onChange={(id) => patchConfig({ preferredCoffee: id })} />
            <ItemSelect label="Slot 2 · Dessert" items={menu.filter((m) => m.category === "desserts")} value={cfg.preferredDessert ?? ""} onChange={(id) => patchConfig({ preferredDessert: id })} />
            <ItemSelect label="Slot 3 · Side" items={menu.filter((m) => m.category === "antipasti")} value={cfg.preferredGarlicBread ?? ""} onChange={(id) => patchConfig({ preferredGarlicBread: id })} />
            <ItemSelect label="Slot 4 · Drink" items={menu.filter((m) => m.category === "drinks")} value={cfg.preferredDrink ?? ""} onChange={(id) => patchConfig({ preferredDrink: id })} />
          </div>
        </div>
      ) : tab === "combos" ? (
        <div className="av3-card" style={{ padding: 0 }}>
          {usingDefaultCombos && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--av3-line)", fontSize: 11.5, color: "var(--av3-muted)" }}>
              Showing the default chain combos (live on this location). Edit or toggle any deal to customise — your changes save as this location&rsquo;s override.
            </div>
          )}
          {combos.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No combos</div><div className="av3-empty-text">Add a combo deal to nudge a complementary category into the cart.</div></div>
          ) : (
            <Table columns={comboCols} rows={combos} rowKey={(c) => c.id} onRowClick={(c) => setEdit(c)} />
          )}
        </div>
      ) : tab === "timeOfDay" ? (
        <div className="av3-card" style={{ padding: 0 }}>
          {usingDefaultWindows && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--av3-line)", fontSize: 11.5, color: "var(--av3-muted)" }}>
              Showing the five default time-of-day banners (live on this location). Edit or toggle any window to customise — your changes save as this location&rsquo;s override.
            </div>
          )}
          {windows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No time windows</div><div className="av3-empty-text">Add a window to change the cart nudge by time of day (breakfast espresso, late-night deals…).</div></div>
          ) : (
            <Table
              columns={[
                { key: "title", header: "Window", render: (w: TimeWindow) => <div><div style={{ fontWeight: 600 }}>{w.title || w.variant}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{w.sub}</div></div> },
                { key: "time", header: "Hours", render: (w: TimeWindow) => <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{String(w.startHour).padStart(2, "0")}:00–{String(w.endHour).padStart(2, "0")}:00</span> },
                { key: "badge", header: "Badge", render: (w: TimeWindow) => <span className="av3-cell-muted">{w.badge || "—"}</span> },
                { key: "act", header: "", render: (w: TimeWindow) => <Switch checked={w.active} disabled={saving} label={w.active ? "Live" : "Off"} onClick={(e) => e.stopPropagation()} onChange={() => upsertWindow({ ...w, active: !w.active })} /> },
              ]}
              rows={windows} rowKey={(w) => w.id} onRowClick={(w) => setEditWin(w)}
            />
          )}
        </div>
      ) : (
        <BadgesTab menu={menu} cfg={cfg} onChange={patchConfig} />
      )}

      {edit && <ComboDialog combo={edit === "new" ? null : edit} city={city} menu={menu} onClose={() => setEdit(null)} onSave={(c) => { upsertCombo(c); setEdit(null); }} onDelete={edit !== "new" ? () => { removeCombo((edit as Combo).id); setEdit(null); } : undefined} />}
      {editWin && <WindowDialog win={editWin === "new" ? null : editWin} city={city} onClose={() => setEditWin(null)} onSave={(w) => { upsertWindow(w); setEditWin(null); }} onDelete={editWin !== "new" ? () => { removeWindow((editWin as TimeWindow).id); setEditWin(null); } : undefined} />}
    </>
  );
}

/* ── pairing item picker ───────────────────────────────────────────────── */
function ItemSelect({ label, items, value, onChange }: { label: string; items: MenuItemLite[]; value: string; onChange: (id: string) => void }) {
  return (
    <label className="av3-field">
      <span className="av3-field-label">{label}</span>
      <select className="av3-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none —</option>
        {items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </label>
  );
}

/* ── badges tab (6 multi-selects, intrinsic from menuRole) ─────────────── */
function BadgesTab({ menu, cfg, onChange }: { menu: MenuItemLite[]; cfg: LocationConfig; onChange: (patch: Partial<LocationConfig>) => void }) {
  const intrinsic = (role: MenuRole) => menu.filter((m) => m.menuRole === role).map((m) => m.id);
  const groups: { key: keyof LocationConfig; label: string; hint?: string; locked?: MenuRole }[] = [
    { key: "heroItems", label: "Our Hero — full-width gateway", locked: "hero", hint: "Gold-locked items come from menuRole: hero" },
    { key: "pizzaioloChoiceItems", label: "Pizzaiolo's Choice — profit driver", locked: "profit-driver", hint: "Gold-locked items come from menuRole: profit-driver" },
    { key: "chefSignatureItems", label: "Chef's Signature — range anchor", locked: "anchor", hint: "Gold-locked items come from menuRole: anchor" },
    { key: "newItems", label: "New — launch highlight" },
    { key: "popularItems", label: "Most Popular — trending chip" },
    { key: "staffPicks", label: "Staff Pick — editorial nudge" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 300px),1fr))", gap: 14 }}>
      {groups.map((g) => (
        <MultiSelectCard
          key={String(g.key)}
          label={g.label}
          hint={g.hint}
          menu={menu}
          selected={(cfg[g.key] as string[] | undefined) ?? []}
          intrinsicIds={g.locked ? intrinsic(g.locked) : []}
          onChange={(ids) => onChange({ [g.key]: ids })}
        />
      ))}
    </div>
  );
}

function MultiSelectCard({ label, hint, menu, selected, intrinsicIds, onChange }: {
  label: string; hint?: string; menu: MenuItemLite[]; selected: string[]; intrinsicIds: string[]; onChange: (ids: string[]) => void;
}) {
  const intrinsicSet = new Set(intrinsicIds);
  const toggle = (id: string) => { if (intrinsicSet.has(id)) return; onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]); };
  return (
    <div className="av3-card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 2 }}>{label}</div>
      {hint && <div className="av3-cell-muted" style={{ fontSize: 10.5, marginBottom: 8 }}>{hint}</div>}
      <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {menu.map((m) => {
          const locked = intrinsicSet.has(m.id);
          const on = locked || selected.includes(m.id);
          return (
            <button key={m.id} type="button" onClick={() => toggle(m.id)} disabled={locked}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 8px", borderRadius: 6, border: "1px solid", borderColor: on ? "var(--av3-line-strong)" : "transparent", background: on ? "var(--av3-s2)" : "transparent", color: on ? "var(--av3-fg)" : "var(--av3-muted)", cursor: locked ? "default" : "pointer", fontSize: 12, textAlign: "left" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
              {locked ? <Badge tone="brand">auto</Badge> : on ? <span style={{ color: "var(--av3-platinum)" }}>●</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── combo dialog ──────────────────────────────────────────────────────── */
const deriveSuffix = (id: string) => id.replace(/^[^-]+-/, "");

function ComboDialog({ combo, city, menu, onClose, onSave, onDelete }: { combo: Combo | null; city: string; menu: MenuItemLite[]; onClose: () => void; onSave: (c: Combo) => void; onDelete?: () => void }) {
  const [name, setName] = useState(combo?.name ?? "");
  const [description, setDescription] = useState(combo?.description ?? "");
  const [categories, setCategories] = useState((combo?.categories ?? []).join(", "));
  const [discount, setDiscount] = useState(String(combo?.discountPercent ?? 10));
  const [minItems, setMinItems] = useState(String(combo?.minItems ?? 2));
  const [channel, setChannel] = useState<string>(combo?.channel ?? "");
  const [active, setActive] = useState(combo?.active ?? true);
  // Round-trip requiredItems — without this, editing the Italian Classic /
  // Pizza & Side defaults would silently drop their item gating (v2 parity).
  const [requiredItems, setRequiredItems] = useState<RequiredItem[]>(combo?.requiredItems ?? []);

  const updateReq = (i: number, patch: Partial<RequiredItem>) => setRequiredItems((arr) => arr.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeReq = (i: number) => setRequiredItems((arr) => arr.filter((_, idx) => idx !== i));
  const addReq = () => { const first = menu[0]; if (!first) return; setRequiredItems((arr) => [...arr, { suffix: deriveSuffix(first.id), label: first.name }]); };

  const submit = () => {
    if (!name.trim()) return;
    const reqs = requiredItems.filter((r) => r.suffix.trim());
    onSave({
      id: combo?.id ?? `combo-${Date.now()}`,
      name: name.trim(), description: description.trim(),
      categories: categories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      discountPercent: Math.max(0, Math.min(100, Math.round(Number(discount) || 0))),
      minItems: Math.max(1, Math.round(Number(minItems) || 1)),
      active,
      channel: channel === "" ? undefined : (channel as "dine-in" | "delivery"),
      ...(reqs.length > 0 ? { requiredItems: reqs } : {}),
    });
  };

  return (
    <Dialog open onClose={onClose} title={combo ? combo.name : "New combo"} subtitle={`${city} · combo deal`} width={520}
      footer={<>{onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!name.trim()} onClick={submit}>Save</Button></>}>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Description</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Categories (comma-separated)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="pizza, drinks, desserts" /></div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 1fr 90px" }}>
        <label className="av3-field"><span className="av3-field-label">Discount %</span><input className="av3-input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Min items</span><input className="av3-input" type="number" value={minItems} onChange={(e) => setMinItems(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Channel</span><select className="av3-select" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Both</option><option value="dine-in">Dine-in</option><option value="delivery">Delivery</option></select></label>
        <div className="av3-field"><span className="av3-field-label">Live</span><Switch aria-label="Live" checked={active} onChange={setActive} /></div>
      </div>

      <div className="av3-subhead">Required items <span style={{ fontWeight: 400, color: "var(--av3-subtle)" }}>(optional — overrides &ldquo;any of category&rdquo;)</span></div>
      {requiredItems.length === 0 ? (
        <div className="av3-cell-muted" style={{ fontSize: 11, marginBottom: 6 }}>Generic combo: any item in the categories above qualifies. Add a specific item to lock the deal (e.g. Italian Classic = Margherita + Limonata + Tiramisù).</div>
      ) : (
        requiredItems.map((r, i) => {
          const matched = menu.find((m) => deriveSuffix(m.id) === r.suffix);
          return (
            <div key={i} className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 28px", marginBottom: 6, alignItems: "end" }}>
              <label className="av3-field"><span className="av3-field-label">Item</span>
                <select className="av3-select" value={matched?.id ?? ""} onChange={(e) => { const p = menu.find((m) => m.id === e.target.value); if (p) updateReq(i, { suffix: deriveSuffix(p.id), label: p.name }); }}>
                  {!matched && <option value="">⚠ Unknown ({r.suffix})</option>}
                  {menu.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="av3-field"><span className="av3-field-label">Label</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={r.label} onChange={(e) => updateReq(i, { label: e.target.value })} /></label>
              <button type="button" className="av3-iconbtn-sm" aria-label="Remove required item" onClick={() => removeReq(i)}><Trash2 /></button>
            </div>
          );
        })
      )}
      <Button variant="ghost" size="sm" onClick={addReq} disabled={menu.length === 0} style={{ marginTop: 4 }}><Plus className="av3-btn-ico" /> Add required item</Button>
    </Dialog>
  );
}

/* ── time-window dialog ────────────────────────────────────────────────── */
function WindowDialog({ win, city, onClose, onSave, onDelete }: { win: TimeWindow | null; city: string; onClose: () => void; onSave: (w: TimeWindow) => void; onDelete?: () => void }) {
  const [variant, setVariant] = useState(win?.variant ?? "lunch");
  const [startHour, setStartHour] = useState(String(win?.startHour ?? 11));
  const [endHour, setEndHour] = useState(String(win?.endHour ?? 15));
  const [title, setTitle] = useState(win?.title ?? "");
  const [sub, setSub] = useState(win?.sub ?? "");
  const [badge, setBadge] = useState(win?.badge ?? "");
  const [cta, setCta] = useState(win?.cta ?? "");
  const [addItemIdSuffix, setAddItemIdSuffix] = useState(win?.addItemIdSuffix ?? "");
  const [active, setActive] = useState(win?.active ?? true);

  const hr = (v: string) => Math.max(0, Math.min(23, Math.round(Number(v) || 0)));
  const submit = () => {
    if (!title.trim()) return;
    onSave({ id: win?.id ?? `tw-${Date.now()}`, variant, startHour: hr(startHour), endHour: hr(endHour), title: title.trim(), sub: sub.trim(), badge: badge.trim(), cta: cta.trim(), addItemIdSuffix: addItemIdSuffix.trim() || undefined, active });
  };

  return (
    <Dialog open onClose={onClose} title={win ? (win.title || "Time window") : "New time window"} subtitle={`${city} · time-of-day nudge`} width={520}
      footer={<>{onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!title.trim()} onClick={submit}>Save</Button></>}>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 90px 90px 80px", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Variant (skin)</span><select className="av3-select" value={variant} onChange={(e) => setVariant(e.target.value)}>{TIME_VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="av3-field"><span className="av3-field-label">Start hr</span><input className="av3-input" type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">End hr</span><input className="av3-input" type="number" min={0} max={23} value={endHour} onChange={(e) => setEndHour(e.target.value)} /></label>
        <div className="av3-field"><span className="av3-field-label">Live</span><Switch aria-label="Live" checked={active} onChange={setActive} /></div>
      </div>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Title</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Buongiorno — start with an espresso" /></div>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Subtitle</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={sub} onChange={(e) => setSub(e.target.value)} /></div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="av3-field"><span className="av3-field-label">Badge</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={badge} onChange={(e) => setBadge(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">CTA</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={cta} onChange={(e) => setCta(e.target.value)} /></label>
      </div>
      <div className="av3-field" style={{ marginTop: 10 }}><span className="av3-field-label">One-tap add item id suffix (optional)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={addItemIdSuffix} onChange={(e) => setAddItemIdSuffix(e.target.value)} placeholder="e.g. espresso" /></div>
    </Dialog>
  );
}
