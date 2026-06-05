"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Dialog, Table, type ColumnV3 } from "./ui";

interface Combo {
  id: string;
  name: string;
  description: string;
  categories: string[];
  discountPercent: number;
  minItems: number;
  active: boolean;
  channel?: "dine-in" | "delivery";
}
type LocationConfig = { combos?: Combo[]; [k: string]: unknown };
type Settings = Record<string, LocationConfig>;

export function CrossSellV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<Combo | "new" | null>(null);

  const load = useCallback(async () => {
    const res = (await fetch("/api/admin/upsell").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))) as Settings;
    setSettings(res && typeof res === "object" ? res : {});
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const cfg = settings[loc] ?? {};
  const combos = (cfg.combos ?? []) as Combo[];

  // Round-trip the FULL location config so bundles / badge lists are preserved.
  const saveCombos = async (next: Combo[]) => {
    setSaving(true);
    try {
      const config = { ...cfg, combos: next };
      const res = await fetch("/api/admin/upsell", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationSlug: loc, config }) });
      if (res.ok) setSettings((s) => ({ ...s, [loc]: config }));
    } finally { setSaving(false); }
  };

  const toggle = (id: string) => saveCombos(combos.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
  const upsert = (combo: Combo) => saveCombos(combos.some((c) => c.id === combo.id) ? combos.map((c) => (c.id === combo.id ? combo : c)) : [...combos, combo]);
  const remove = (id: string) => saveCombos(combos.filter((c) => c.id !== id));

  const cols: ColumnV3<Combo>[] = [
    { key: "name", header: "Combo", render: (c) => <span style={{ fontWeight: 600 }}>{c.name}</span> },
    { key: "cats", header: "Categories", render: (c) => <span className="av3-cell-muted">{c.categories.join(" + ") || "—"}</span> },
    { key: "disc", header: "Discount", num: true, render: (c) => `${c.discountPercent}%` },
    { key: "min", header: "Min items", num: true, render: (c) => `${c.minItems}` },
    { key: "ch", header: "Channel", render: (c) => <span className="av3-cell-muted">{c.channel ?? "both"}</span> },
    { key: "act", header: "", render: (c) => <button type="button" className="av3-toggle" data-on={c.active} disabled={saving} onClick={(e) => { e.stopPropagation(); toggle(c.id); }} style={{ padding: "0 12px" }}>{c.active ? "Live" : "Off"}</button> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Cross-sell</h1>
          <div className="av3-pagehead-sub">Combo deals · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setEdit("new")}><Plus className="av3-btn-ico" /> Add combo</Button>
        </div>
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading combos…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {combos.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No combos</div><div className="av3-empty-text">Add a combo deal to nudge a complementary category into the cart.</div></div>
          ) : (
            <Table columns={cols} rows={combos} rowKey={(c) => c.id} onRowClick={(c) => setEdit(c)} />
          )}
        </div>
      )}

      {edit && <ComboDialog combo={edit === "new" ? null : edit} city={city} onClose={() => setEdit(null)} onSave={(c) => { upsert(c); setEdit(null); }} onDelete={edit !== "new" ? () => { remove((edit as Combo).id); setEdit(null); } : undefined} />}
    </>
  );
}

function ComboDialog({ combo, city, onClose, onSave, onDelete }: { combo: Combo | null; city: string; onClose: () => void; onSave: (c: Combo) => void; onDelete?: () => void }) {
  const [name, setName] = useState(combo?.name ?? "");
  const [description, setDescription] = useState(combo?.description ?? "");
  const [categories, setCategories] = useState((combo?.categories ?? []).join(", "));
  const [discount, setDiscount] = useState(String(combo?.discountPercent ?? 10));
  const [minItems, setMinItems] = useState(String(combo?.minItems ?? 2));
  const [channel, setChannel] = useState<string>(combo?.channel ?? "");
  const [active, setActive] = useState(combo?.active ?? true);

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: combo?.id ?? `combo-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      categories: categories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      discountPercent: Math.max(0, Math.min(100, Math.round(Number(discount) || 0))),
      minItems: Math.max(1, Math.round(Number(minItems) || 1)),
      active,
      channel: channel === "" ? undefined : (channel as "dine-in" | "delivery"),
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
        <label className="av3-field"><span className="av3-field-label">Live</span><button type="button" className="av3-toggle" data-on={active} onClick={() => setActive((v) => !v)} style={{ height: 32 }}>{active ? "On" : "Off"}</button></label>
      </div>
    </Dialog>
  );
}
