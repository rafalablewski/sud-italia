"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Coffee,
  Plus,
  Trash2,
  Check,
  Clock,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
import { DEFAULT_TIME_WINDOWS } from "@/lib/upsell";
import type { MenuItem, MenuCategory } from "@/data/types";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ComboDealConfig {
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
export interface TimeWindowConfig {
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

export interface BundleSlotConfig {
  kind: "category" | "item";
  category?: string;
  itemIdSuffix?: string;
  quantity: number;
}

export interface BundleConfig {
  id: string;
  tier: string;
  name: string;
  description: string;
  priceGrosze: number;
  refPriceGrosze: number;
  composition: BundleSlotConfig[];
  mealPeriod: string;
  isAnchor?: boolean;
  isDecoy?: boolean;
  isDefault?: boolean;
  active: boolean;
}

export interface BundleRulesConfig {
  lunch: { startHour: number; endHour: number };
  family: { minMainItems: number; hintWithin: number };
}

export interface LocationConfig {
  popularItems: string[];
  staffPicks: string[];
  preferredCoffee: string;
  preferredDessert: string;
  preferredDrink: string;
  combos: ComboDealConfig[];
  timeWindows?: TimeWindowConfig[];
  bundleRules?: BundleRulesConfig;
  bundles?: BundleConfig[];
}

export type AllSettings = Record<string, LocationConfig>;

// ─── Constants ───────────────────────────────────────────────────────────

export const TIME_WINDOW_VARIANTS = [
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "late",
] as const;

export const LOCATIONS = [
  { slug: "krakow", name: "Kraków", menu: krakowMenu },
  { slug: "warszawa", name: "Warszawa", menu: warszawaMenu },
];

export const CATEGORIES: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

export const DEFAULT_COMBOS: ComboDealConfig[] = [
  { id: "meal-deal", name: "Meal Deal", description: "Any main + drink + dessert", categories: ["pizza", "drinks", "desserts"], discountPercent: 10, minItems: 3, active: true },
  { id: "pasta-combo", name: "Pasta Combo", description: "Any pasta + drink + dessert", categories: ["pasta", "drinks", "desserts"], discountPercent: 10, minItems: 3, active: true },
  { id: "lunch-special", name: "Lunch Special", description: "Any panino + drink", categories: ["panini", "drinks"], discountPercent: 8, minItems: 2, active: true },
];

export const DEFAULT_BUNDLE_RULES: BundleRulesConfig = {
  lunch: { startHour: 11, endHour: 14 },
  family: { minMainItems: 5, hintWithin: 2 },
};

// Mirror of DEFAULT_BUNDLES from src/lib/bundles.ts. Kept local so this
// client module doesn't import the server module.
export const DEFAULT_BUNDLES_FALLBACK: BundleConfig[] = [
  { id: "lunch-solo", tier: "Solo", name: "Just the pasta", description: "1 pasta of your choice", priceGrosze: 2600, refPriceGrosze: 2600, composition: [{ kind: "category", category: "pasta", quantity: 1 }], mealPeriod: "lunch", active: true },
  { id: "lunch-classic", tier: "Lunch", name: "Pasta + drink", description: "1 pasta + 1 drink. The classic.", priceGrosze: 3200, refPriceGrosze: 3800, composition: [{ kind: "category", category: "pasta", quantity: 1 }, { kind: "category", category: "drinks", quantity: 1 }], mealPeriod: "lunch", isDefault: true, active: true },
  { id: "lunch-plus", tier: "Lunch+", name: "Pasta + drink + tiramisù", description: "A meal you'll remember.", priceGrosze: 4600, refPriceGrosze: 5600, composition: [{ kind: "category", category: "pasta", quantity: 1 }, { kind: "category", category: "drinks", quantity: 1 }, { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 }], mealPeriod: "lunch", isAnchor: true, active: true },
  { id: "lunch-hungry", tier: "Hungry", name: "+ bruschetta", description: "Pasta, drink, dessert & bruschetta. For a real one.", priceGrosze: 5800, refPriceGrosze: 7600, composition: [{ kind: "category", category: "pasta", quantity: 1 }, { kind: "category", category: "drinks", quantity: 1 }, { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 }, { kind: "item", itemIdSuffix: "anti-bruschetta", quantity: 1 }], mealPeriod: "lunch", isDecoy: true, active: true },
  { id: "family-classic", tier: "Family", name: "Two pizzas + sides", description: "2 pizzas + 1 side + 2 drinks", priceGrosze: 8900, refPriceGrosze: 10800, composition: [{ kind: "category", category: "pizza", quantity: 2 }, { kind: "category", category: "antipasti", quantity: 1 }, { kind: "category", category: "drinks", quantity: 2 }], mealPeriod: "family", active: true },
  { id: "family-feast", tier: "Family Feast", name: "Whole-table dinner", description: "2 pizzas + bruschetta + 4 drinks + tiramisù", priceGrosze: 11900, refPriceGrosze: 16200, composition: [{ kind: "category", category: "pizza", quantity: 2 }, { kind: "item", itemIdSuffix: "anti-bruschetta", quantity: 1 }, { kind: "category", category: "drinks", quantity: 4 }, { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 }], mealPeriod: "family", isAnchor: true, active: true },
  { id: "family-deluxe", tier: "Feast Deluxe", name: "Big group, no leftovers", description: "3 pizzas + 2 sides + 6 drinks + 2 desserts", priceGrosze: 16900, refPriceGrosze: 23200, composition: [{ kind: "category", category: "pizza", quantity: 3 }, { kind: "category", category: "antipasti", quantity: 2 }, { kind: "category", category: "drinks", quantity: 6 }, { kind: "category", category: "desserts", quantity: 2 }], mealPeriod: "family", isDecoy: true, active: true },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

export function getDefaultConfig(slug: string): LocationConfig {
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

export function clampHour(value: number, max = 23): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

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

// ─── Shared selling-settings hook ────────────────────────────────────────

/** Single source of truth for loading / saving location-scoped selling
 *  settings. Both /admin/upsell and /admin/crosssell mount this hook;
 *  each renders editors for its own slice of the LocationConfig, but the
 *  PUT always writes the full record so the other page's fields are
 *  preserved. */
export function useSellingSettings() {
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
      setSettings((prev) => {
        const current = prev[activeLocation] || getDefaultConfig(activeLocation);
        return { ...prev, [activeLocation]: { ...current, ...updates } };
      });
      setSaved(false);
    },
    [activeLocation],
  );

  const handleSave = useCallback(async () => {
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
  }, [activeLocation, settings]);

  return {
    activeLocation,
    setActiveLocation,
    loc,
    config,
    loading,
    saving,
    saved,
    updateConfig,
    handleSave,
  };
}

// ─── Editor components ───────────────────────────────────────────────────

export function ItemMultiSelect({
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

export function ItemSingleSelect({
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

export function ComboEditor({
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

export function TimeWindowsEditor({
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
  };
  const resetToDefaults = () => {
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
          const isOpen = !collapsed.has(w.id);
          return (
            <div
              key={w.id}
              className={`glass-card p-4 space-y-3 ${!w.active ? "opacity-50" : ""}`}
            >
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
            No windows configured. &ldquo;Add window&rdquo; to create one.
          </p>
        )}
      </div>
    </div>
  );
}

export function BundlesEditor({
  bundles,
  onChange,
}: {
  bundles: BundleConfig[];
  onChange: (next: BundleConfig[]) => void;
}) {
  const lunchBundles = bundles.filter((b) => b.mealPeriod === "lunch");
  const familyBundles = bundles.filter((b) => b.mealPeriod === "family");

  const update = (id: string, patch: Partial<BundleConfig>) => {
    onChange(bundles.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const remove = (id: string) => onChange(bundles.filter((b) => b.id !== id));
  const addBundle = (mealPeriod: "lunch" | "family") => {
    const fresh: BundleConfig = {
      id: `${mealPeriod}-${Math.random().toString(36).slice(2, 8)}`,
      tier: mealPeriod === "lunch" ? "New Lunch tier" : "New Family tier",
      name: "Bundle name",
      description: "What's in it",
      priceGrosze: mealPeriod === "lunch" ? 3500 : 9900,
      refPriceGrosze: mealPeriod === "lunch" ? 4000 : 11000,
      composition: [{ kind: "category", category: mealPeriod === "lunch" ? "pasta" : "pizza", quantity: 1 }],
      mealPeriod,
      active: true,
    };
    onChange([...bundles, fresh]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <label className="text-xs font-semibold admin-text uppercase tracking-wide">
            Bundle ladder
          </label>
          <p className="text-xs admin-text-secondary mt-0.5">
            Decoy + anchor + default-pushed combos surfaced in the cart drawer.
            Mark one Lunch tier as <em>default</em> (red &ldquo;Most picked&rdquo;) and one
            Lunch + one Family tier as <em>anchor</em> (gold &ldquo;Best value&rdquo;).
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <BundleLadderSection
          title="Lunch ladder"
          bundles={lunchBundles}
          onUpdate={update}
          onRemove={remove}
          onAdd={() => addBundle("lunch")}
        />
        <BundleLadderSection
          title="Family Feast ladder"
          bundles={familyBundles}
          onUpdate={update}
          onRemove={remove}
          onAdd={() => addBundle("family")}
        />
      </div>
    </div>
  );
}

function BundleLadderSection({
  title,
  bundles,
  onUpdate,
  onRemove,
  onAdd,
}: {
  title: string;
  bundles: BundleConfig[];
  onUpdate: (id: string, patch: Partial<BundleConfig>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="admin-text font-semibold text-sm">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-white/20 text-xs admin-text hover:bg-white/10"
        >
          <Plus className="h-3 w-3" /> Add tier
        </button>
      </div>
      {bundles.length === 0 ? (
        <p className="admin-text-secondary text-xs">No tiers yet — add one above.</p>
      ) : (
        <div className="grid gap-2">
          {bundles.map((b) => (
            <BundleTierRow
              key={b.id}
              bundle={b}
              onChange={(patch) => onUpdate(b.id, patch)}
              onRemove={() => onRemove(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BundleTierRow({
  bundle,
  onChange,
  onRemove,
}: {
  bundle: BundleConfig;
  onChange: (patch: Partial<BundleConfig>) => void;
  onRemove: () => void;
}) {
  const savings = Math.max(0, bundle.refPriceGrosze - bundle.priceGrosze);
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_140px_auto] items-center">
        <input
          className="glass-input"
          value={bundle.tier}
          placeholder="Tier label"
          onChange={(e) => onChange({ tier: e.target.value })}
        />
        <input
          className="glass-input"
          value={bundle.name}
          placeholder="Bundle name"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <label className="flex items-center gap-1 text-xs admin-text-secondary">
          Price (zł)
          <input
            className="glass-input w-20 text-right"
            type="number"
            min={0}
            value={(bundle.priceGrosze / 100).toFixed(2)}
            onChange={(e) =>
              onChange({ priceGrosze: Math.round(parseFloat(e.target.value || "0") * 100) })
            }
          />
        </label>
        <label className="flex items-center gap-1 text-xs admin-text-secondary">
          You&rsquo;d pay
          <input
            className="glass-input w-20 text-right"
            type="number"
            min={0}
            value={(bundle.refPriceGrosze / 100).toFixed(2)}
            onChange={(e) =>
              onChange({
                refPriceGrosze: Math.round(parseFloat(e.target.value || "0") * 100),
              })
            }
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-400 hover:text-red-300"
          aria-label="Remove tier"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <input
        className="glass-input mt-2 w-full"
        value={bundle.description}
        placeholder="Short description rendered under the bundle name"
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <div className="flex flex-wrap gap-3 items-center mt-2 text-xs admin-text-secondary">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!bundle.isDefault}
            onChange={(e) =>
              onChange({ isDefault: e.target.checked, isAnchor: e.target.checked ? false : bundle.isAnchor, isDecoy: e.target.checked ? false : bundle.isDecoy })
            }
          />
          <span>Default-pushed (red)</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!bundle.isAnchor}
            onChange={(e) =>
              onChange({ isAnchor: e.target.checked, isDefault: e.target.checked ? false : bundle.isDefault, isDecoy: e.target.checked ? false : bundle.isDecoy })
            }
          />
          <span>Anchor (gold)</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!bundle.isDecoy}
            onChange={(e) =>
              onChange({ isDecoy: e.target.checked, isDefault: e.target.checked ? false : bundle.isDefault, isAnchor: e.target.checked ? false : bundle.isAnchor })
            }
          />
          <span>Decoy</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={bundle.active}
            onChange={(e) => onChange({ active: e.target.checked })}
          />
          <span>Active</span>
        </label>
        {savings > 0 && (
          <span className="text-italia-gold">Save zł {(savings / 100).toFixed(2)}</span>
        )}
      </div>
      <CompositionEditor
        composition={bundle.composition}
        onChange={(composition) => onChange({ composition })}
      />
    </div>
  );
}

function CompositionEditor({
  composition,
  onChange,
}: {
  composition: BundleSlotConfig[];
  onChange: (next: BundleSlotConfig[]) => void;
}) {
  const update = (i: number, patch: Partial<BundleSlotConfig>) => {
    onChange(composition.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const remove = (i: number) => onChange(composition.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...composition, { kind: "category", category: "drinks", quantity: 1 }]);
  return (
    <div className="mt-3">
      <p className="text-[11px] uppercase tracking-wide admin-text-secondary font-semibold mb-1">
        Composition
      </p>
      <div className="grid gap-1.5">
        {composition.map((slot, i) => (
          <div
            key={i}
            className="grid gap-1.5 grid-cols-[80px_1fr_60px_auto] items-center text-xs"
          >
            <select
              className="glass-input"
              value={slot.kind}
              onChange={(e) =>
                update(i, {
                  kind: e.target.value as BundleSlotConfig["kind"],
                  category: e.target.value === "category" ? slot.category ?? "drinks" : undefined,
                  itemIdSuffix:
                    e.target.value === "item" ? slot.itemIdSuffix ?? "dessert-tiramisu" : undefined,
                })
              }
            >
              <option value="category">Any of</option>
              <option value="item">Specific</option>
            </select>
            {slot.kind === "category" ? (
              <select
                className="glass-input"
                value={slot.category ?? "drinks"}
                onChange={(e) => update(i, { category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="glass-input"
                value={slot.itemIdSuffix ?? ""}
                placeholder="dessert-tiramisu"
                onChange={(e) => update(i, { itemIdSuffix: e.target.value })}
              />
            )}
            <input
              className="glass-input"
              type="number"
              min={1}
              max={10}
              value={slot.quantity}
              onChange={(e) =>
                update(i, { quantity: Math.max(1, Number(e.target.value) || 1) })
              }
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-red-400 hover:text-red-300"
              aria-label="Remove slot"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-white/20 text-[11px] admin-text-secondary hover:bg-white/5 w-fit"
        >
          <Plus className="h-3 w-3" /> Add slot
        </button>
      </div>
    </div>
  );
}

export function BundleRulesEditor({
  rules,
  onChange,
}: {
  rules: BundleRulesConfig;
  onChange: (next: BundleRulesConfig) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <label className="text-xs font-semibold admin-text uppercase tracking-wide">
            Bundle availability
          </label>
          <p className="text-xs admin-text-secondary mt-0.5">
            Lunch ladder is hour-gated; Family Feast ladder is quantity-gated.
            Within hint range, the cart drawer shows a one-line nudge instead
            of the full ladder.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="admin-text font-semibold text-sm mb-2">Lunch ladder window</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] admin-text-secondary uppercase tracking-wide mb-1">Start hour</span>
              <input
                type="number"
                min={0}
                max={23}
                value={rules.lunch.startHour}
                onChange={(e) =>
                  onChange({
                    ...rules,
                    lunch: { ...rules.lunch, startHour: clampHour(Number(e.target.value)) },
                  })
                }
                className="glass-input w-full"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] admin-text-secondary uppercase tracking-wide mb-1">End hour</span>
              <input
                type="number"
                min={0}
                max={24}
                value={rules.lunch.endHour}
                onChange={(e) =>
                  onChange({
                    ...rules,
                    lunch: { ...rules.lunch, endHour: clampHour(Number(e.target.value)) },
                  })
                }
                className="glass-input w-full"
              />
            </label>
          </div>
          <p className="text-[11px] admin-text-secondary mt-2">
            Default 11–14 (shown for [start, end), so 11–14 = 11:00 through 13:59).
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="admin-text font-semibold text-sm mb-2">Family Feast quantity gate</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] admin-text-secondary uppercase tracking-wide mb-1">Min mains (pizza + pasta)</span>
              <input
                type="number"
                min={2}
                max={20}
                value={rules.family.minMainItems}
                onChange={(e) =>
                  onChange({
                    ...rules,
                    family: { ...rules.family, minMainItems: Math.max(2, Number(e.target.value) || 2) },
                  })
                }
                className="glass-input w-full"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] admin-text-secondary uppercase tracking-wide mb-1">Hint within</span>
              <input
                type="number"
                min={0}
                max={10}
                value={rules.family.hintWithin}
                onChange={(e) =>
                  onChange({
                    ...rules,
                    family: { ...rules.family, hintWithin: Math.max(0, Number(e.target.value) || 0) },
                  })
                }
                className="glass-input w-full"
              />
            </label>
          </div>
          <p className="text-[11px] admin-text-secondary mt-2">
            Default min 5, hint within 2 — i.e. show the &ldquo;add 1 more pizza
            or pasta&rdquo; nudge once the cart has 3 or 4 mains.
          </p>
        </div>
      </div>
    </div>
  );
}
