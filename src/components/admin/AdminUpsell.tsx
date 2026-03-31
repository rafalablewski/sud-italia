"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import { LocationTabs } from "./LocationTabs";
import { TrendingUp, Star, Coffee, IceCream, GlassWater, Plus, Trash2, Check, Save } from "lucide-react";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
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

interface LocationConfig {
  popularItems: string[];
  staffPicks: string[];
  preferredCoffee: string;
  preferredDessert: string;
  preferredDrink: string;
  combos: ComboDealConfig[];
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
        id: `combo-${Date.now()}`,
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
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${combo.active ? "left-5.5" : "left-0.5"}`} />
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
      await fetch("/api/admin/upsell", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationSlug: activeLocation, config: configToSave }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Failed to save");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <>
        <AdminNav />
        <div className="max-w-7xl mx-auto p-6">
          <div className="glass-card p-12 text-center">
            <p className="admin-text animate-pulse">Loading upsell settings...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    <AdminNav />
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold admin-text flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-slate-400" />
            Upsell & Cross-Sell
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure suggestions, popular items, and combo deals per location
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="glass-btn flex items-center gap-2 px-5 py-2.5 font-semibold"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-400">Saved</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </>
          )}
        </button>
      </div>

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
    </div>
    </>
  );
}
