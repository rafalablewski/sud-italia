"use client";

import { useState, useEffect, useCallback } from "react";
import { LocationTabs } from "./LocationTabs";
import {
  Star,
  Coffee,
  IceCream,
  GlassWater,
  Plus,
  Trash2,
  Check,
  Save,
  Clock,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
import { DEFAULT_TIME_WINDOWS } from "@/lib/upsell";
import type { MenuItem, MenuCategory } from "@/data/types";

interface ComboDealConfig {
  id: string;
  name: string;
  description: string;
  categories: string[];
  discountPercent: number;
  minItems: number;
  active: boolean;
}

/** Mirrors LocationTimeWindow from src/lib/store.ts. Repeated here as a local
 *  type rather than imported to keep this client component out of the
 *  server-only store module. */
interface TimeWindowConfig {
  id: string;
  variant: string;
  startHour: number;
  endHour: number;
  title: string;
  sub: string;
  badge: string;
  cta: string;
  addItemIdSuffix?: string;
  active: boolean;
}

const TIME_WINDOW_VARIANTS = [
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "late",
] as const;

interface LocationConfig {
  popularItems: string[];
  staffPicks: string[];
  preferredCoffee: string;
  preferredDessert: string;
  preferredDrink: string;
  combos: ComboDealConfig[];
  timeWindows?: TimeWindowConfig[];
}

type AllSettings = Record<string, LocationConfig>;

const LOCATIONS = [
  { slug: "krakow", name: "Kraków", menu: krakowMenu },
  { slug: "warszawa", name: "Warszawa", menu: warszawaMenu },
];

const CATEGORIES: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

const DEFAULT_COMBOS: ComboDealConfig[] = [
  { id: "meal-deal", name: "Meal Deal", description: "Any main + drink + dessert", categories: ["pizza", "drinks", "desserts"], discountPercent: 10, minItems: 3, active: true },
  { id: "pasta-combo", name: "Pasta Combo", description: "Any pasta + drink + dessert", categories: ["pasta", "drinks", "desserts"], discountPercent: 10, minItems: 3, active: true },
  { id: "lunch-special", name: "Lunch Special", description: "Any panino + drink", categories: ["panini", "drinks"], discountPercent: 8, minItems: 2, active: true },
];

function getDefaultConfig(slug: string): LocationConfig {
  if (slug === "krakow") {
    return {
      popularItems: ["krk-pizza-margherita", "krk-pizza-diavola", "krk-pasta-carbonara", "krk-dessert-tiramisu", "krk-drink-limonata"],
      staffPicks: ["krk-pizza-quattro-formaggi", "krk-anti-burrata", "krk-pasta-pesto"],
      preferredCoffee: "krk-drink-espresso",
      preferredDessert: "krk-dessert-tiramisu",
      preferredDrink: "krk-drink-limonata",
      combos: DEFAULT_COMBOS.map((c) => ({ ...c })),
    };
  }
  return {
    popularItems: ["waw-pizza-margherita", "waw-pizza-bufala", "waw-pasta-carbonara", "waw-dessert-tiramisu", "waw-drink-limonata"],
    staffPicks: ["waw-pizza-napoli", "waw-anti-burrata", "waw-pasta-cacio-pepe"],
    preferredCoffee: "waw-drink-espresso",
    preferredDessert: "waw-dessert-tiramisu",
    preferredDrink: "waw-drink-limonata",
    combos: DEFAULT_COMBOS.map((c) => ({ ...c })),
  };
}

function ItemMultiSelect({
  items,
  selected,
  onChange,
  label,
}: {
  items: MenuItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <label className="text-xs font-semibold admin-text uppercase tracking-wide mb-2 block">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map((id) => {
          const item = items.find((m) => m.id === id);
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 text-sm admin-text border border-white/10">
              <span className="text-xs text-slate-400">{item?.category}</span>
              {item?.name || id}
              <button
                onClick={() => onChange(selected.filter((s) => s !== id))}
                className="ml-1 text-red-400 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-white/20 text-sm text-slate-400 hover:text-white hover:border-white/40 transition-colors"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>
      {adding && (
        <div className="glass-card p-3 mb-2 max-h-48 overflow-y-auto">
          {items
            .filter((m) => !selected.includes(m.id))
            .map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onChange([...selected, m.id]);
                  setAdding(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm admin-text hover:bg-white/8 rounded-lg transition-colors"
              >
                <span className="text-xs text-slate-400 mr-2">[{m.category}]</span>
                {m.name} — {(m.price / 100).toFixed(0)} PLN
              </button>
            ))}
          <button
            onClick={() => setAdding(false)}
            className="block w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function ItemSingleSelect({
  items,
  value,
  onChange,
  label,
  icon: Icon,
}: {
  items: MenuItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  icon: typeof Coffee;
}) {
  return (
    <div>
      <label className="text-xs font-semibold admin-text uppercase tracking-wide mb-1.5 flex items-center gap-1.5 block">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glass-input w-full text-sm"
      >
        <option value="">None</option>
        {items.map((m) => (
          <option key={m.id} value={m.id}>
            [{m.category}] {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ComboEditor({
  combos,
  onChange,
}: {
  combos: ComboDealConfig[];
  onChange: (combos: ComboDealConfig[]) => void;
}) {
  const addCombo = () => {
    onChange([
      ...combos,
      {
        id: `combo-${crypto.randomUUID()}`,
        name: "New Combo",
        description: "",
        categories: ["pizza", "drinks"],
        discountPercent: 10,
        minItems: 2,
        active: true,
      },
    ]);
  };

  const updateCombo = (index: number, updates: Partial<ComboDealConfig>) => {
    const updated = [...combos];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeCombo = (index: number) => {
    onChange(combos.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold admin-text uppercase tracking-wide">Combo Deals</label>
        <button
          onClick={addCombo}
          className="glass-btn"
        >
          <Plus className="h-3 w-3" /> Add Combo
        </button>
      </div>
      <div className="space-y-3">
        {combos.map((combo, i) => (
          <div key={combo.id} className={`glass-card p-4 space-y-3 ${!combo.active ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateCombo(i, { active: !combo.active })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${combo.active ? "bg-emerald-500" : "bg-white/15"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${combo.active ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <input
                  type="text"
                  value={combo.name}
                  onChange={(e) => updateCombo(i, { name: e.target.value })}
                  className="glass-input text-sm font-semibold w-40"
                />
              </div>
              <button
                onClick={() => removeCombo(i)}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <input
              type="text"
              value={combo.description}
              onChange={(e) => updateCombo(i, { description: e.target.value })}
              placeholder="Description (e.g. Any main + drink + dessert)"
              className="glass-input text-sm w-full"
            />

            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Discount %</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={combo.discountPercent}
                  onChange={(e) => updateCombo(i, { discountPercent: Number(e.target.value) })}
                  className="glass-input text-sm w-20"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Min items</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={combo.minItems}
                  onChange={(e) => updateCombo(i, { minItems: Number(e.target.value) })}
                  className="glass-input text-sm w-20"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1.5">Required categories</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => {
                  const selected = combo.categories.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        const cats = selected
                          ? combo.categories.filter((c) => c !== cat)
                          : [...combo.categories, cat];
                        updateCombo(i, { categories: cats, minItems: Math.min(combo.minItems, cats.length) });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        selected
                          ? "bg-italia-red/20 text-italia-red border border-italia-red/30"
                          : "bg-white/5 text-slate-400 border border-white/10 hover:border-white/25"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3 inline mr-1" />}
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        {combos.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">No combo deals configured for this location.</p>
        )}
      </div>
    </div>
  );
}

/** Materialise DEFAULT_TIME_WINDOWS into the editor's TimeWindowConfig
 *  shape so the editor and the runtime resolver agree on field names. */
function defaultsAsConfig(): TimeWindowConfig[] {
  return DEFAULT_TIME_WINDOWS.map((w) => ({
    id: w.id,
    variant: w.variant,
    startHour: w.startHour,
    endHour: w.endHour,
    title: w.title,
    sub: w.sub,
    badge: w.badge,
    cta: w.cta,
    addItemIdSuffix: w.addItemId ?? "",
    active: true,
  }));
}

function TimeWindowsEditor({
  windows,
  onChange,
}: {
  windows?: TimeWindowConfig[];
  onChange: (windows: TimeWindowConfig[]) => void;
}) {
  // When the location has no saved windows we still want to *show* the five
  // defaults so the admin sees what's running today and can edit in place.
  // The defaults aren't pushed upstream until the admin actually changes
  // something — otherwise opening the page would mark the form dirty.
  const usingDefaults = !windows || windows.length === 0;
  const list: TimeWindowConfig[] = usingDefaults ? defaultsAsConfig() : windows;

  // Rows are expanded by default; admin clicks the chevron on any row to
  // fold it away when scanning. We track *collapsed* ids so a freshly
  // added window is open without needing to seed its id into the set.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // If admin makes any edit while we're showing defaults, materialise the
  // defaults upstream first so the edit lands on a real array.
  const materialise = (): TimeWindowConfig[] => (usingDefaults ? defaultsAsConfig() : [...list]);

  const addWindow = () => {
    const next = materialise();
    const id = `tod-${crypto.randomUUID()}`;
    next.push({
      id,
      variant: "lunch",
      startHour: 11,
      endHour: 13,
      title: "Lunch combo",
      sub: "Add a pasta and a drink to save 10%",
      badge: "−10%",
      cta: "How it works",
      addItemIdSuffix: "",
      active: true,
    });
    onChange(next);
    // No need to seed the new row — defaults-open means it's open already.
  };
  const resetToDefaults = () => {
    // Empty array → editor falls back to showing the hardcoded defaults
    // (and the runtime resolver does the same).
    onChange([]);
    setCollapsed(new Set());
  };
  const updateWindow = (index: number, updates: Partial<TimeWindowConfig>) => {
    const next = materialise();
    next[index] = { ...next[index], ...updates };
    onChange(next);
  };
  const removeWindow = (index: number) => {
    const next = materialise();
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <label className="text-xs font-semibold admin-text uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-italia-gold" />
            Time-of-day Banners
          </label>
          <p className="text-[11px] text-slate-400 mt-1">
            One banner at a time, picked by local hour. {usingDefaults
              ? "Showing the five hardcoded defaults — edit any row to override."
              : "Override active for this location. Reset to revert."}{" "}
            Audit §2.3.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!usingDefaults && (
            <button onClick={resetToDefaults} className="glass-btn" title="Discard overrides and use the five defaults">
              <RotateCcw className="h-3 w-3" /> Reset to defaults
            </button>
          )}
          <button onClick={addWindow} className="glass-btn">
            <Plus className="h-3 w-3" /> Add window
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {list.map((w, i) => {
          // Default-open: the row is open unless explicitly collapsed.
          const isOpen = !collapsed.has(w.id);
          return (
            <div
              key={w.id}
              className={`glass-card p-4 space-y-3 ${!w.active ? "opacity-50" : ""}`}
            >
              {/* Header row — always visible */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => toggleExpanded(w.id)}
                    className="p-1 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                    aria-label={isOpen ? "Collapse window" : "Expand window"}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => updateWindow(i, { active: !w.active })}
                    className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${w.active ? "bg-emerald-500" : "bg-white/15"}`}
                    aria-label={w.active ? "Disable window" : "Enable window"}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${w.active ? "left-[22px]" : "left-0.5"}`} />
                  </button>

                  {isOpen ? (
                    <>
                      <select
                        value={w.variant}
                        onChange={(e) => updateWindow(i, { variant: e.target.value })}
                        className="glass-input text-sm w-32 flex-shrink-0"
                      >
                        {TIME_WINDOW_VARIANTS.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={w.startHour}
                          onChange={(e) =>
                            updateWindow(i, { startHour: clampHour(Number(e.target.value)) })
                          }
                          className="glass-input text-sm w-16"
                        />
                        <span>→</span>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          value={w.endHour}
                          onChange={(e) =>
                            updateWindow(i, { endHour: clampHour(Number(e.target.value), 24) })
                          }
                          className="glass-input text-sm w-16"
                        />
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => toggleExpanded(w.id)}
                      className="flex items-center gap-2 min-w-0 text-left hover:text-white transition-colors"
                      title="Expand to edit"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-italia-gold flex-shrink-0">
                        {w.variant}
                      </span>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {w.startHour}–{w.endHour}
                      </span>
                      <span className="text-sm admin-text truncate">
                        {w.title}
                      </span>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => removeWindow(i)}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                  aria-label="Remove window"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Body — only when expanded */}
              {isOpen && (
                <>
                  <input
                    type="text"
                    value={w.title}
                    onChange={(e) => updateWindow(i, { title: e.target.value })}
                    placeholder="Banner title"
                    className="glass-input text-sm w-full"
                  />
                  <input
                    type="text"
                    value={w.sub}
                    onChange={(e) => updateWindow(i, { sub: e.target.value })}
                    placeholder="Sub-line (the one-sentence why)"
                    className="glass-input text-sm w-full"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Badge</label>
                      <input
                        type="text"
                        value={w.badge}
                        onChange={(e) => updateWindow(i, { badge: e.target.value })}
                        placeholder="−10% / Quick add / Pre-order"
                        className="glass-input text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">CTA</label>
                      <input
                        type="text"
                        value={w.cta}
                        onChange={(e) => updateWindow(i, { cta: e.target.value })}
                        placeholder="Add espresso / How it works"
                        className="glass-input text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Add-item id suffix
                      </label>
                      <input
                        type="text"
                        value={w.addItemIdSuffix ?? ""}
                        onChange={(e) =>
                          updateWindow(i, { addItemIdSuffix: e.target.value.trim() })
                        }
                        placeholder="e.g. espresso (blank = no add)"
                        className="glass-input text-sm w-full"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">
            No windows configured. "Add window" to create one.
          </p>
        )}
      </div>
    </div>
  );
}

function clampHour(value: number, max = 23): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function AdminUpsell() {
  const [settings, setSettings] = useState<AllSettings>({});
  const [activeLocation, setActiveLocation] = useState(LOCATIONS[0].slug);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/upsell")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loc = LOCATIONS.find((l) => l.slug === activeLocation)!;
  const config: LocationConfig = settings[activeLocation] || getDefaultConfig(activeLocation);

  const updateConfig = useCallback(
    (updates: Partial<LocationConfig>) => {
      setSettings((prev) => ({
        ...prev,
        [activeLocation]: { ...config, ...updates },
      }));
      setSaved(false);
    },
    [activeLocation, config]
  );

  const handleSave = async () => {
    setSaving(true);
    const configToSave = settings[activeLocation] || getDefaultConfig(activeLocation);
    try {
      const res = await fetch("/api/admin/upsell", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationSlug: activeLocation, config: configToSave }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Failed to save");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading upsell settings…</div>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Upsell & Cross-Sell</h1>
          <p className="v2-page-subtitle">
            Configure suggestions, popular items, and combo deals per location.
          </p>
        </div>
        <div className="v2-page-actions">
          <button
            onClick={handleSave}
            disabled={saving}
            className="v2-btn v2-btn-primary v2-btn-sm"
          >
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save changes"}
              </>
            )}
          </button>
        </div>
      </header>

      {/* Location tabs */}
      <LocationTabs value={activeLocation} onChange={setActiveLocation} />

      {/* Cross-sell preferences */}
      <div className="glass-card p-6 space-y-5">
        <h2 className="font-heading font-bold text-lg admin-text flex items-center gap-2">
          <Star className="h-5 w-5 text-italia-gold" />
          Cross-Sell Preferences — {loc.name}
        </h2>
        <p className="text-xs text-slate-400">
          These items are suggested when a customer adds a main course to their cart.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ItemSingleSelect
            items={loc.menu.filter((m) => m.category === "drinks")}
            value={config.preferredCoffee}
            onChange={(id) => updateConfig({ preferredCoffee: id })}
            label="Preferred Coffee"
            icon={Coffee}
          />
          <ItemSingleSelect
            items={loc.menu.filter((m) => m.category === "desserts")}
            value={config.preferredDessert}
            onChange={(id) => updateConfig({ preferredDessert: id })}
            label="Preferred Dessert"
            icon={IceCream}
          />
          <ItemSingleSelect
            items={loc.menu.filter((m) => m.category === "drinks")}
            value={config.preferredDrink}
            onChange={(id) => updateConfig({ preferredDrink: id })}
            label="Preferred Drink"
            icon={GlassWater}
          />
        </div>
      </div>

      {/* Popular items & staff picks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <ItemMultiSelect
            items={loc.menu}
            selected={config.popularItems}
            onChange={(ids) => updateConfig({ popularItems: ids })}
            label="Popular Items (badges shown on menu)"
          />
        </div>
        <div className="glass-card p-6">
          <ItemMultiSelect
            items={loc.menu}
            selected={config.staffPicks}
            onChange={(ids) => updateConfig({ staffPicks: ids })}
            label="Staff Picks (badges shown on menu)"
          />
        </div>
      </div>

      {/* Combo deals */}
      <div className="glass-card p-6">
        <ComboEditor
          combos={config.combos}
          onChange={(combos) => updateConfig({ combos })}
        />
      </div>

      {/* Time-of-day banners (audit §2.3) */}
      <div className="glass-card p-6">
        <TimeWindowsEditor
          windows={config.timeWindows}
          onChange={(timeWindows) => updateConfig({ timeWindows })}
        />
      </div>
    </div>
  );
}
