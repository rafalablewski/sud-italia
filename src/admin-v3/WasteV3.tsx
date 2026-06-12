"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, LayoutGrid, Rows3, Tag, Trash2 } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Dialog, InfoButton, Kpi, Table, type ColumnV3 } from "./ui";

interface WasteEntry {
  id: string;
  locationSlug: string;
  item: string;
  quantity: number;
  unit: string;
  reason: string;
  estimatedCostGrosze?: number;
  recordedAt: string;
}

interface IngredientLite {
  id: string;
  name: string;
  category?: string;
  unit?: string;
}

// Pre-set unit picker — grouped so the operator scans to the right family
// fast at the line. Values are the short codes we store; labels spell them
// out. Weight & count lead because that's the bulk of pizza-line waste.
const UNIT_GROUPS: { label: string; units: { value: string; label: string }[] }[] = [
  { label: "Weight / mass", units: [
    { value: "kg", label: "Kilogram (kg)" },
    { value: "g", label: "Gram (g)" },
    { value: "mg", label: "Milligram (mg)" },
    { value: "lb", label: "Pound (lb)" },
    { value: "oz", label: "Ounce (oz)" },
    { value: "t", label: "Ton (t)" },
  ] },
  { label: "Count & packaging", units: [
    { value: "piece", label: "Each / piece" },
    { value: "dozen", label: "Dozen" },
    { value: "slice", label: "Slice" },
    { value: "loaf", label: "Loaf" },
    { value: "bunch", label: "Bunch" },
    { value: "case", label: "Case" },
    { value: "pack", label: "Pack" },
    { value: "box", label: "Box" },
    { value: "crate", label: "Crate" },
    { value: "tub", label: "Tub" },
    { value: "bottle", label: "Bottle" },
    { value: "can", label: "Can" },
    { value: "bag", label: "Bag" },
  ] },
  { label: "Volume & capacity", units: [
    { value: "L", label: "Liter (L)" },
    { value: "ml", label: "Milliliter (mL)" },
    { value: "gal", label: "Gallon (gal)" },
    { value: "qt", label: "Quart (qt)" },
    { value: "pt", label: "Pint (pt)" },
    { value: "cup", label: "Cup (c)" },
    { value: "fl oz", label: "Fluid ounce (fl oz)" },
    { value: "tbsp", label: "Tablespoon (tbsp)" },
    { value: "tsp", label: "Teaspoon (tsp)" },
  ] },
  { label: "Length", units: [
    { value: "m", label: "Meter (m)" },
    { value: "cm", label: "Centimeter (cm)" },
    { value: "mm", label: "Millimeter (mm)" },
    { value: "ft", label: "Foot (ft)" },
    { value: "in", label: "Inch (in)" },
  ] },
  { label: "Temperature", units: [
    { value: "°C", label: "Celsius (°C)" },
    { value: "°F", label: "Fahrenheit (°F)" },
    { value: "K", label: "Kelvin (K)" },
  ] },
];
const KNOWN_UNITS = new Set(UNIT_GROUPS.flatMap((g) => g.units.map((u) => u.value)));

const REASONS: { value: string; label: string }[] = [
  { value: "spoilage", label: "Spoilage" },
  { value: "prep_error", label: "Prep error" },
  { value: "dropped", label: "Dropped / damaged" },
  { value: "overproduction", label: "Over-production" },
  { value: "customer_return", label: "Customer return" },
  { value: "expired", label: "Expired" },
  { value: "other", label: "Other" },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function WasteV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [logs, setLogs] = useState<WasteEntry[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLite[]>([]);
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [reason, setReason] = useState("spoilage");
  const [costStr, setCostStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [reasonFilter, setReasonFilter] = useState<"all" | string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ location: loc, from: startOfTodayIso() });
    const res = await fetch(`/api/admin/waste?${qs}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setLogs(Array.isArray(res) ? res : []);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  // Ingredient catalog is chain-wide, so fetch it once (not per-location).
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/ingredients`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list) => { if (alive) setIngredients(Array.isArray(list) ? list : []); });
    return () => { alive = false; };
  }, []);

  // Sorted, de-duped ingredient names for the picker datalist.
  const ingredientOptions = useMemo(() => {
    const byName = new Map<string, IngredientLite>();
    for (const ing of ingredients) {
      if (ing?.name && !byName.has(ing.name.toLowerCase())) byName.set(ing.name.toLowerCase(), ing);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients]);

  // Picking a known ingredient pre-fills its default unit; free text still works.
  const onItemChange = (value: string) => {
    setItem(value);
    const match = ingredients.find((ing) => ing.name.toLowerCase() === value.trim().toLowerCase());
    if (match?.unit && KNOWN_UNITS.has(match.unit)) setUnit(match.unit);
  };

  const qtyNum = parseFloat(quantity);
  const canSubmit = item.trim().length > 0 && Number.isFinite(qtyNum) && qtyNum > 0;
  const draftCostGrosze = costStr.trim() === "" || Number.isNaN(parseFloat(costStr)) ? null : Math.max(0, Math.round(parseFloat(costStr) * 100));

  const record = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const costGrosze = draftCostGrosze ?? undefined;
      const res = await fetch("/api/admin/waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationSlug: loc, item: item.trim(), quantity: qtyNum, unit: unit.trim(), reason, estimatedCostGrosze: Number.isFinite(costGrosze as number) ? costGrosze : undefined }),
      });
      if (res.ok) { setItem(""); setQuantity(""); setCostStr(""); await load(); }
    } finally {
      setSaving(false);
    }
  };

  const costToday = logs.reduce((s, l) => s + (l.estimatedCostGrosze ?? 0), 0);
  // Top reason today by cost (falls back to count when nothing is costed).
  const topReason = useMemo(() => {
    if (logs.length === 0) return null;
    const byReason = new Map<string, { cost: number; n: number }>();
    for (const l of logs) {
      const cur = byReason.get(l.reason) ?? { cost: 0, n: 0 };
      cur.cost += l.estimatedCostGrosze ?? 0; cur.n += 1;
      byReason.set(l.reason, cur);
    }
    const sorted = [...byReason.entries()].sort((a, b) => b[1].cost - a[1].cost || b[1].n - a[1].n);
    return sorted[0] ? REASON_LABEL[sorted[0][0]] ?? sorted[0][0] : null;
  }, [logs]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.filter((l) =>
      (reasonFilter === "all" || l.reason === reasonFilter) &&
      (!needle || l.item.toLowerCase().includes(needle)));
  }, [logs, q, reasonFilter]);
  const detail = detailId ? logs.find((l) => l.id === detailId) ?? null : null;
  const shareOf = (g?: number) => (g && costToday > 0 ? Math.round((g / costToday) * 100) : 0);

  const cols: ColumnV3<WasteEntry>[] = [
    { key: "t", header: "Time", render: (l) => <span className="av3-cell-muted">{fmtTime(l.recordedAt)}</span> },
    { key: "i", header: "Item", render: (l) => <span style={{ fontWeight: 500 }}>{l.item}</span> },
    { key: "q", header: "Qty", num: true, render: (l) => `${l.quantity} ${l.unit}` },
    { key: "r", header: "Reason", render: (l) => <Badge tone="neutral">{REASON_LABEL[l.reason] ?? l.reason}</Badge> },
    { key: "c", header: "Cost", num: true, render: (l) => (l.estimatedCostGrosze ? formatPrice(l.estimatedCostGrosze) : <span className="av3-cell-muted">—</span>) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Waste log</h1>
          <div className="av3-pagehead-sub">Reason-coded write-offs · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Entries today" icon={Trash2} value={`${logs.length}`} accentVar="--av3-c5" />
        <Kpi label="Write-off today" icon={Coins} value={formatPrice(costToday)} accentVar="--av3-c1"
          info={<InfoButton title="Write-off today" description="Total estimated cost of everything logged as waste today on this location."
            institutional="Waste is pure margin leakage — it hits the P&L at full food cost with zero offsetting revenue, so a złoty wasted is worth several złoty of sales to replace. Benchmark: a tight pizza operation runs 2–4% of food cost as waste; above ~6% it's a process problem (over-prep, poor rotation, portioning), not bad luck. This tile is the daily pulse; the reason mix tells you where to cut."
            plain="Bin 2 kg of mozzarella and a tray of dough and that might be 80 zł gone. At a 25% food cost you'd need ~320 zł of extra sales just to break even on that one mistake — cheaper to not waste it."
            tips="Log everything (uncosted waste is invisible waste); attack the top reason first — over-production means prep to a tighter par, spoilage means fix rotation/FIFO; review this daily at close so a bad pattern is caught in days, not at month-end stocktake."
            methodology="Sum of estimatedCostGrosze across today's waste entries for this location (/api/admin/waste). Entries logged without a cost contribute zero — fill the cost field so the number stays honest." />} />
        <Kpi label="Top reason" icon={Tag} value={topReason ?? "—"} accentVar="--av3-c4" />
      </div>

      <Card>
        <CardHead title="Log waste" />
        <CardBody>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ flex: 1, minWidth: 180 }}>
              <span className="av3-field-label">Item</span>
              <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} list="waste-ingredient-options" value={item} onChange={(e) => onItemChange(e.target.value)} placeholder="Pick an ingredient or type your own…" autoComplete="off" />
              <datalist id="waste-ingredient-options">
                {ingredientOptions.map((ing) => <option key={ing.id} value={ing.name} />)}
              </datalist>
            </label>
            <label className="av3-field" style={{ width: 90 }}><span className="av3-field-label">Qty</span><input className="av3-input" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
            <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Unit</span>
              <select className="av3-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNIT_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Reason</span>
              <select className="av3-select" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            </label>
            <label className="av3-field" style={{ width: 100 }}><span className="av3-field-label">Cost (zł)</span><input className="av3-input" type="number" step="0.01" value={costStr} onChange={(e) => setCostStr(e.target.value)} placeholder="opt." /></label>
            <Button variant="primary" size="sm" loading={saving} disabled={!canSubmit} onClick={record}>Log waste</Button>
          </div>
          {/* live preview of the entry being logged */}
          {canSubmit && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-md)", background: "var(--av3-s2)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{item.trim()}</span>
              <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 12, color: "var(--av3-muted)" }}>{qtyNum} {unit.trim()}</span>
              <Badge tone="neutral">{REASON_LABEL[reason]}</Badge>
              {draftCostGrosze != null && draftCostGrosze > 0 && (
                <>
                  <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 13, fontWeight: 600, color: "var(--av3-bad)" }}>{formatPrice(draftCostGrosze)}</span>
                  <span className="av3-cell-muted" style={{ fontSize: 11 }}>→ today&rsquo;s write-off becomes {formatPrice(costToday + draftCostGrosze)}</span>
                </>
              )}
              {(draftCostGrosze == null || draftCostGrosze === 0) && <span className="av3-cell-muted" style={{ fontSize: 11 }}>add a cost so this counts toward the write-off total</span>}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="av3-toolbar">
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 220, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item…" />
        <span className="av3-toolbar-spacer" />
        <span className="av3-cell-muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
        <div className="av3-viewtoggle" role="tablist" aria-label="Waste view">
          <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} aria-label="Board view" title="Board view"><LayoutGrid /></button>
          <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} aria-label="Table view" title="Table view"><Rows3 /></button>
        </div>
      </div>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${reasonFilter === "all" ? "is-active" : ""}`} onClick={() => setReasonFilter("all")}>All<span className="av3-fchip-count">{logs.length}</span></button>
        {REASONS.filter((r) => logs.some((l) => l.reason === r.value)).map((r) => (
          <button key={r.value} type="button" className={`av3-fchip ${reasonFilter === r.value ? "is-active" : ""}`} onClick={() => setReasonFilter(r.value)}>{r.label}<span className="av3-fchip-count">{logs.filter((l) => l.reason === r.value).length}</span></button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <div className="av3-empty"><div className="av3-empty-title">{logs.length === 0 ? "No waste today" : "Nothing matches"}</div><div className="av3-empty-text">{logs.length === 0 ? "Log a write-off above when something’s discarded." : "Adjust the search or filter."}</div></div>
        </Card>
      ) : view === "table" ? (
        <Card style={{ padding: 0 }}>
          <Table columns={cols} rows={rows} rowKey={(l) => l.id} onRowClick={(l) => setDetailId(l.id)} />
        </Card>
      ) : (
        <div className="av3-board">
          {rows.map((l) => (
            <div key={l.id} className="av3-dcard" role="button" tabIndex={0}
              onClick={() => setDetailId(l.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(l.id); } }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <div className="av3-dcard-name">{l.item}</div>
                <span className="av3-cell-muted" style={{ fontSize: 11 }}>{fmtTime(l.recordedAt)}</span>
              </div>
              <div className="av3-dcard-badges"><Badge tone="neutral">{REASON_LABEL[l.reason] ?? l.reason}</Badge></div>
              <div className="av3-dcard-foot" style={{ paddingTop: 8 }}>
                <div>
                  <div className="av3-dcard-price" style={{ color: l.estimatedCostGrosze ? "var(--av3-bad)" : "var(--av3-fg)" }}>{l.estimatedCostGrosze ? formatPrice(l.estimatedCostGrosze) : "—"}</div>
                  <div className="av3-dcard-sub">{l.quantity} {l.unit}{l.estimatedCostGrosze ? ` · ${shareOf(l.estimatedCostGrosze)}% of today` : ""}</div>
                </div>
                <span className="av3-dcard-cta">Details →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <Dialog open onClose={() => setDetailId(null)} title={detail.item} subtitle={`${city} · ${fmtTime(detail.recordedAt)}`}
          headerExtra={<Badge tone="neutral">{REASON_LABEL[detail.reason] ?? detail.reason}</Badge>} width={480}
          footer={<Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>Close</Button>}>
          <div className="av3-od-grid">
            <div className="av3-od-field"><div className="k">Quantity</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{detail.quantity} {detail.unit}</div></div>
            <div className="av3-od-field"><div className="k">Reason</div><div className="v">{REASON_LABEL[detail.reason] ?? detail.reason}</div></div>
            <div className="av3-od-field"><div className="k">Est. cost</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: detail.estimatedCostGrosze ? "var(--av3-bad)" : "var(--av3-fg)" }}>{detail.estimatedCostGrosze ? formatPrice(detail.estimatedCostGrosze) : "—"}</div></div>
            <div className="av3-od-field"><div className="k">Share of today</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{detail.estimatedCostGrosze ? `${shareOf(detail.estimatedCostGrosze)}%` : "—"}</div></div>
            <div className="av3-od-field"><div className="k">Recorded</div><div className="v" style={{ fontSize: 12 }}>{new Date(detail.recordedAt).toLocaleString("pl-PL")}</div></div>
            <div className="av3-od-field"><div className="k">Location</div><div className="v">{city}</div></div>
          </div>
          {!detail.estimatedCostGrosze && (
            <div className="av3-edhint" style={{ marginTop: 14 }}>No cost was recorded for this entry, so it doesn&rsquo;t count toward the write-off total. Cost every write-off to keep the waste % honest.</div>
          )}
        </Dialog>
      )}
    </>
  );
}
