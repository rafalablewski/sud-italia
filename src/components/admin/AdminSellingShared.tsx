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
import { DEFAULT_COMBO_DEALS, DEFAULT_TIME_WINDOWS } from "@/lib/upsell";
import { DEFAULT_BUNDLES } from "@/lib/bundles";
import { useToast } from "./v2/ui/Toast";
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
  /** Optional item-suffix gating (Italian Classic Deal style). Mirrors
   *  ComboDeal.requiredItems in @/lib/upsell. The admin UI doesn't expose
   *  an editor yet, but the type is here so the field round-trips through
   *  saves rather than being stripped by the spread in updateCombo. */
  requiredItems?: { suffix: string; label: string }[];
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
  composition: BundleSlotConfig[];
  mealPeriod: string;
  isAnchor?: boolean;
  isDecoy?: boolean;
  isDefault?: boolean;
  active: boolean;
  /** "fixed" (default when omitted, lunch tiers) or "dynamic" (family tiers
   *  where the mains-count scales with the cart). Round-trips through saves
   *  via the existing spread; missing = "fixed" for back-compat. */
  pricingMode?: "fixed" | "dynamic";
  // ---- fixed-mode fields ----
  priceGrosze?: number;
  refPriceGrosze?: number;
  // ---- dynamic-mode fields ----
  /** Cart categories that scale with the bundle (typically pizza+pasta). */
  mainCategories?: string[];
  /** Min cart-mains for this tier to apply. */
  minMains?: number;
  /** Optional cap so a 50-pizza cart can't abuse the discount. */
  maxMains?: number;
  /** 0–50. Applied to (mains à la carte + cheapest-add-ons subtotal)
   *  when the split-mode fields are not set. */
  discountPercent?: number;
  /** Split-discount mode: separate %s for mains vs add-ons so the
   *  operator can protect demand-anchor (pizza) margin while still
   *  giving away the high-GM attachments. */
  mainsDiscountPercent?: number;
  addOnsDiscountPercent?: number;
  /** Optional loyalty gate. */
  requiredTier?: "gold" | "platinum";
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

// Derive from the server-side DEFAULT_COMBO_DEALS so the admin "no config
// yet" seed never drifts from the runtime fallback. The active flag isn't
// on ComboDeal (runtime treats absence as live), so we layer it on here.
export const DEFAULT_COMBOS: ComboDealConfig[] = DEFAULT_COMBO_DEALS.map((c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  categories: [...c.categories],
  discountPercent: c.discountPercent,
  minItems: c.minItems,
  active: true,
  ...(c.requiredItems ? { requiredItems: c.requiredItems.map((r) => ({ ...r })) } : {}),
}));

export const DEFAULT_BUNDLE_RULES: BundleRulesConfig = {
  lunch: { startHour: 11, endHour: 14 },
  family: { minMainItems: 5, hintWithin: 2 },
};

// Re-export the canonical defaults from src/lib/bundles.ts. BundleTier is
// structurally assignable to BundleConfig (narrower category + mealPeriod
// types), so editors can consume it directly without duplication.
export const DEFAULT_BUNDLES_FALLBACK: BundleConfig[] = DEFAULT_BUNDLES;

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
 *  preserved.
 *
 *  Dirty locations are tracked across tab switches so a user can edit
 *  Kraków, switch to Warszawa, edit, then hit "Save changes" once and have
 *  both PUTs fire. If the initial load fails we surface `loadError` and
 *  refuse to save — without this guard a save would write
 *  `getDefaultConfig()` over the real production settings. */
export function useSellingSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<AllSettings>({});
  const [activeLocation, setActiveLocation] = useState(LOCATIONS[0].slug);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    fetch("/api/admin/upsell")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setSettings(data || {});
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load settings");
        setLoading(false);
      });
  }, []);

  const loc = LOCATIONS.find((l) => l.slug === activeLocation) ?? LOCATIONS[0];
  const config: LocationConfig = settings[activeLocation] || getDefaultConfig(activeLocation);

  const updateConfig = useCallback(
    (updates: Partial<LocationConfig>) => {
      setSettings((prev) => {
        const current = prev[activeLocation] || getDefaultConfig(activeLocation);
        return { ...prev, [activeLocation]: { ...current, ...updates } };
      });
      setDirty((prev) => {
        if (prev.has(activeLocation)) return prev;
        const next = new Set(prev);
        next.add(activeLocation);
        return next;
      });
      setSaved(false);
    },
    [activeLocation],
  );

  const handleSave = useCallback(async () => {
    if (loadError) {
      toast.error("Can't save", "Settings failed to load — reload the page before editing.");
      return;
    }
    if (dirty.size === 0) return;

    setSaving(true);
    const failures: string[] = [];
    for (const slug of dirty) {
      const configToSave = settings[slug] || getDefaultConfig(slug);
      try {
        const res = await fetch("/api/admin/upsell", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationSlug: slug, config: configToSave }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        failures.push(slug);
      }
    }

    if (failures.length === 0) {
      setDirty(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      // Keep failed locations marked dirty so the next click retries them.
      setDirty(new Set(failures));
      const names = failures
        .map((slug) => LOCATIONS.find((l) => l.slug === slug)?.name ?? slug)
        .join(", ");
      toast.error("Couldn't save some locations", names);
    }
    setSaving(false);
  }, [dirty, loadError, settings, toast]);

  return {
    activeLocation,
    setActiveLocation,
    loc,
    config,
    loading,
    loadError,
    saving,
    saved,
    isDirty: dirty.size > 0,
    dirtyLocations: dirty,
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
  menu,
  onChange,
}: {
  combos: ComboDealConfig[];
  /** Active-location menu used to populate the "specific items required"
   *  picker. Empty array hides the picker rows but keeps the type stable. */
  menu: MenuItem[];
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

            <RequiredItemsEditor
              menu={menu}
              items={combo.requiredItems}
              onChange={(next) => updateCombo(i, { requiredItems: next })}
            />
          </div>
        ))}
        {combos.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">No combo deals configured for this location.</p>
        )}
      </div>
    </div>
  );
}

/** Editor for ComboDealConfig.requiredItems — the item-suffix gating that
 *  drives the Italian Classic Deal pattern (Margherita + Espresso + Tiramisù).
 *  Stripping everything up to the first '-' yields a suffix that matches the
 *  same item across all locations (krk- and waw- prefixes both resolve via
 *  endsWith). Passing undefined when the list empties out keeps the admin
 *  route's "non-empty array when set" validation happy and reverts the combo
 *  to category-only mode. */
function RequiredItemsEditor({
  menu,
  items,
  onChange,
}: {
  menu: MenuItem[];
  items: { suffix: string; label: string }[] | undefined;
  onChange: (next: { suffix: string; label: string }[] | undefined) => void;
}) {
  const list = items ?? [];

  const deriveSuffix = (id: string) => id.replace(/^[^-]+-/, "");

  const update = (i: number, patch: Partial<{ suffix: string; label: string }>) => {
    onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length === 0 ? undefined : next);
  };

  const add = () => {
    const first = menu[0];
    if (!first) return;
    onChange([
      ...list,
      { suffix: deriveSuffix(first.id), label: first.name },
    ]);
  };

  // Group menu items by category for the dropdown. Items the admin already
  // picked still appear in the dropdown so they can change rows independently.
  const byCategory = new Map<string, MenuItem[]>();
  for (const m of menu) {
    const arr = byCategory.get(m.category) ?? [];
    arr.push(m);
    byCategory.set(m.category, arr);
  }
  const categoryOrder = CATEGORIES.filter((c) => byCategory.has(c));

  return (
    <div>
      <label className="text-[10px] text-slate-400 block mb-1.5">
        Specific items required (optional — overrides &ldquo;any of category&rdquo;)
      </label>
      {list.length === 0 ? (
        <p className="text-[11px] text-slate-500 mb-2">
          Generic combo: any item in the selected categories qualifies. Add a specific item below to lock the deal
          to particular menu items (e.g. Italian Classic = Margherita + Espresso + Tiramisù).
        </p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {list.map((row, i) => {
            // Find the cart item whose derived suffix matches this row, so
            // the dropdown reflects what the admin picked previously.
            const matched = menu.find((m) => deriveSuffix(m.id) === row.suffix);
            return (
              <div
                key={i}
                className="grid gap-1.5 grid-cols-[1fr_1fr_auto] items-center text-xs"
              >
                <select
                  className="glass-input"
                  value={matched?.id ?? ""}
                  onChange={(e) => {
                    const picked = menu.find((m) => m.id === e.target.value);
                    if (!picked) return;
                    update(i, { suffix: deriveSuffix(picked.id), label: picked.name });
                  }}
                >
                  {!matched && (
                    <option value="">
                      ⚠ Unknown ({row.suffix})
                    </option>
                  )}
                  {categoryOrder.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {byCategory.get(cat)!.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  className="glass-input"
                  value={row.label}
                  placeholder="Display label"
                  onChange={(e) => update(i, { label: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-red-400 hover:text-red-300 p-1"
                  aria-label="Remove required item"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        disabled={menu.length === 0}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-white/20 text-[11px] admin-text-secondary hover:bg-white/5 w-fit disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="h-3 w-3" /> Add specific item
      </button>
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
  menu,
  onChange,
}: {
  bundles: BundleConfig[];
  /** Location menu — threaded down so each tier can render a live
   *  margin preview using MenuItem.cost data. */
  menu: MenuItem[];
  onChange: (next: BundleConfig[]) => void;
}) {
  const lunchBundles = bundles.filter((b) => b.mealPeriod === "lunch");
  const familyBundles = bundles.filter((b) => b.mealPeriod === "family");

  const update = (id: string, patch: Partial<BundleConfig>) => {
    onChange(bundles.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const remove = (id: string) => onChange(bundles.filter((b) => b.id !== id));
  const addBundle = (mealPeriod: "lunch" | "family") => {
    // Lunch tiers stay fixed-price (solo meal, no "X mains" concept).
    // Family tiers default to dynamic since that's the desired behaviour
    // for the new ladder. Admins can flip the mode toggle either way.
    const fresh: BundleConfig =
      mealPeriod === "lunch"
        ? {
            id: `lunch-${Math.random().toString(36).slice(2, 8)}`,
            tier: "New Lunch tier",
            name: "Bundle name",
            description: "What's in it",
            pricingMode: "fixed",
            priceGrosze: 3500,
            refPriceGrosze: 4000,
            composition: [{ kind: "category", category: "pasta", quantity: 1 }],
            mealPeriod,
            active: true,
          }
        : {
            id: `family-${Math.random().toString(36).slice(2, 8)}`,
            tier: "New Family tier",
            name: "Bundle name",
            description: "Your mains + …",
            pricingMode: "dynamic",
            mainCategories: ["pizza", "pasta"],
            minMains: 2,
            discountPercent: 20,
            composition: [
              { kind: "category", category: "antipasti", quantity: 1 },
              { kind: "category", category: "drinks", quantity: 2 },
            ],
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
          menu={menu}
          onUpdate={update}
          onRemove={remove}
          onAdd={() => addBundle("lunch")}
        />
        <BundleLadderSection
          title="Family Feast ladder"
          bundles={familyBundles}
          menu={menu}
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
  menu,
  onUpdate,
  onRemove,
  onAdd,
}: {
  title: string;
  bundles: BundleConfig[];
  menu: MenuItem[];
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
              menu={menu}
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
  menu,
  onChange,
  onRemove,
}: {
  bundle: BundleConfig;
  menu: MenuItem[];
  onChange: (patch: Partial<BundleConfig>) => void;
  onRemove: () => void;
}) {
  const mode: "fixed" | "dynamic" = bundle.pricingMode ?? "fixed";
  const isDynamic = mode === "dynamic";
  const savings = !isDynamic
    ? Math.max(0, (bundle.refPriceGrosze ?? 0) - (bundle.priceGrosze ?? 0))
    : 0;

  const switchToFixed = () => {
    onChange({
      pricingMode: "fixed",
      priceGrosze: bundle.priceGrosze ?? 9900,
      refPriceGrosze: bundle.refPriceGrosze ?? 11000,
      // Clear dynamic-mode fields so the saved shape stays clean.
      mainCategories: undefined,
      minMains: undefined,
      maxMains: undefined,
      discountPercent: undefined,
    });
  };
  const switchToDynamic = () => {
    onChange({
      pricingMode: "dynamic",
      mainCategories: bundle.mainCategories ?? ["pizza", "pasta"],
      minMains: bundle.minMains ?? 2,
      maxMains: bundle.maxMains,
      discountPercent: bundle.discountPercent ?? 20,
      // Clear fixed-mode fields so they don't haunt the saved shape.
      priceGrosze: undefined,
      refPriceGrosze: undefined,
    });
  };

  const mainsSet = new Set(bundle.mainCategories ?? []);

  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] items-center">
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
        {/* Pricing-mode toggle — "Fixed" locks both composition + price; "Dynamic" scales mains with cart. */}
        <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={switchToFixed}
            className={`px-2 py-1 ${!isDynamic ? "bg-italia-gold/20 text-italia-gold-dark" : "admin-text-secondary"}`}
          >
            Fixed
          </button>
          <button
            type="button"
            onClick={switchToDynamic}
            className={`px-2 py-1 ${isDynamic ? "bg-italia-gold/20 text-italia-gold-dark" : "admin-text-secondary"}`}
          >
            Dynamic
          </button>
        </div>
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
        placeholder="Short description — use 'Your mains' to scale with cart on dynamic bundles"
        onChange={(e) => onChange({ description: e.target.value })}
      />

      {/* Mode-specific pricing inputs */}
      {!isDynamic ? (
        <div className="grid gap-2 md:grid-cols-[140px_140px_auto] items-center mt-2">
          <label className="flex items-center gap-1 text-xs admin-text-secondary">
            Price (zł)
            <input
              className="glass-input w-20 text-right"
              type="number"
              min={0}
              value={((bundle.priceGrosze ?? 0) / 100).toFixed(2)}
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
              value={((bundle.refPriceGrosze ?? 0) / 100).toFixed(2)}
              onChange={(e) =>
                onChange({
                  refPriceGrosze: Math.round(parseFloat(e.target.value || "0") * 100),
                })
              }
            />
          </label>
          {savings > 0 && (
            <span className="text-italia-gold text-xs">Save zł {(savings / 100).toFixed(2)}</span>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 md:grid-cols-[140px_140px_140px] items-center">
            <label className="flex items-center gap-1 text-xs admin-text-secondary">
              Discount %
              <input
                className="glass-input w-20 text-right"
                type="number"
                min={0}
                max={50}
                value={bundle.discountPercent ?? 20}
                disabled={bundle.mainsDiscountPercent !== undefined && bundle.addOnsDiscountPercent !== undefined}
                onChange={(e) =>
                  onChange({ discountPercent: clampHour(Number(e.target.value) || 0, 50) })
                }
              />
            </label>
            <label className="flex items-center gap-1 text-xs admin-text-secondary">
              Min mains
              <input
                className="glass-input w-16 text-right"
                type="number"
                min={1}
                value={bundle.minMains ?? 2}
                onChange={(e) =>
                  onChange({ minMains: Math.max(1, Math.round(Number(e.target.value) || 1)) })
                }
              />
            </label>
            <label className="flex items-center gap-1 text-xs admin-text-secondary">
              Max (opt)
              <input
                className="glass-input w-16 text-right"
                type="number"
                min={1}
                value={bundle.maxMains ?? ""}
                placeholder="∞"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  onChange({ maxMains: v === "" ? undefined : Math.max(1, Math.round(Number(v))) });
                }}
              />
            </label>
          </div>

          {/* Split-discount: protect mains margin while keeping add-on
              savings compelling. When unset, both default to the single
              discountPercent field above. */}
          <div className="rounded-md border border-white/10 bg-white/5 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wide admin-text-secondary font-semibold">
                Split discount (advanced)
              </label>
              <label className="inline-flex items-center gap-1 text-[11px] admin-text-secondary">
                <input
                  type="checkbox"
                  checked={bundle.mainsDiscountPercent !== undefined || bundle.addOnsDiscountPercent !== undefined}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? {
                            mainsDiscountPercent: bundle.mainsDiscountPercent ?? Math.max(0, (bundle.discountPercent ?? 20) - 10),
                            addOnsDiscountPercent: bundle.addOnsDiscountPercent ?? Math.min(50, (bundle.discountPercent ?? 20) + 10),
                          }
                        : { mainsDiscountPercent: undefined, addOnsDiscountPercent: undefined },
                    )
                  }
                />
                Enable
              </label>
            </div>
            {(bundle.mainsDiscountPercent !== undefined || bundle.addOnsDiscountPercent !== undefined) && (
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-1 text-xs admin-text-secondary">
                  Mains %
                  <input
                    className="glass-input w-20 text-right"
                    type="number"
                    min={0}
                    max={50}
                    value={bundle.mainsDiscountPercent ?? 0}
                    onChange={(e) =>
                      onChange({ mainsDiscountPercent: clampHour(Number(e.target.value) || 0, 50) })
                    }
                  />
                </label>
                <label className="flex items-center gap-1 text-xs admin-text-secondary">
                  Add-ons %
                  <input
                    className="glass-input w-20 text-right"
                    type="number"
                    min={0}
                    max={50}
                    value={bundle.addOnsDiscountPercent ?? 0}
                    onChange={(e) =>
                      onChange({ addOnsDiscountPercent: clampHour(Number(e.target.value) || 0, 50) })
                    }
                  />
                </label>
              </div>
            )}
            <p className="text-[10px] text-slate-500">
              Higher add-on % protects pizza margin while keeping savings compelling on drinks/desserts.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1.5">Mains scale on these categories</label>
              <div className="flex flex-wrap gap-1.5">
                {(["pizza", "pasta"] as const).map((cat) => {
                  const selected = mainsSet.has(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        const next = new Set(mainsSet);
                        if (selected) next.delete(cat); else next.add(cat);
                        onChange({ mainCategories: Array.from(next) });
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
            <label className="block">
              <span className="text-[10px] text-slate-400 block mb-1.5">Loyalty gate (optional)</span>
              <select
                className="glass-input text-sm w-full"
                value={bundle.requiredTier ?? ""}
                onChange={(e) =>
                  onChange({ requiredTier: e.target.value === "" ? undefined : (e.target.value as "gold" | "platinum") })
                }
              >
                <option value="">All customers</option>
                <option value="gold">Gold & Platinum only</option>
                <option value="platinum">Platinum only</option>
              </select>
            </label>
          </div>
          <p className="text-[10px] text-slate-500">
            Bundle price = (mains-in-cart × menu price + cheapest add-ons) × (1 − discount/100). Composition below
            is the static add-on allowance; main categories are filtered out so they can&rsquo;t double-count.
          </p>
        </div>
      )}

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
      </div>
      <CompositionEditor
        composition={bundle.composition}
        excludeCategories={isDynamic ? Array.from(mainsSet) : []}
        onChange={(composition) => onChange({ composition })}
      />

      <BundleMarginPreview bundle={bundle} menu={menu} />
    </div>
  );
}

/**
 * Live margin preview for a single bundle tier. Shows the bundle price
 * and the estimated contribution margin at a few sample cart sizes,
 * computed off `MenuItem.cost` so the operator can see whether their
 * configured discount % is still profitable before saving. Critical
 * during admin tuning — without it the operator flies blind.
 */
function BundleMarginPreview({
  bundle,
  menu,
}: {
  bundle: BundleConfig;
  menu: MenuItem[];
}) {
  const isDynamic = (bundle.pricingMode ?? "fixed") === "dynamic";

  // Pick a representative main for dynamic bundles — defaults to the
  // cheapest pizza so the preview reflects the most common entry-level
  // cart shape. Admins eyeballing "what if customer adds a premium
  // pizza" can verify by adjusting menu prices in /admin/menu.
  const samplePizza = menu
    .filter((m) => m.available && m.category === "pizza")
    .sort((a, b) => a.price - b.price)[0];

  const cheapestByCat = useCallback(
    (cat: string) =>
      menu
        .filter((m) => m.available && m.category === cat)
        .sort((a, b) => a.price - b.price)[0],
    [menu],
  );

  // Compute price + margin at N mains. Mirrors lib/bundles
  // computeBundlePrice for dynamic; uses stored fixed price otherwise.
  const sampleAt = (mains: number): { price: number; cost: number; margin: number } | null => {
    if (!isDynamic) {
      const price = bundle.priceGrosze ?? 0;
      if (price === 0) return null;
      // Fixed-bundle cost: sum each slot's cheapest candidate × qty.
      let cost = 0;
      for (const slot of bundle.composition) {
        const candidate =
          slot.kind === "item"
            ? menu.find((m) => m.available && m.id.endsWith(slot.itemIdSuffix ?? ""))
            : cheapestByCat(slot.category ?? "");
        if (!candidate) return null;
        cost += (candidate.cost ?? 0) * slot.quantity;
      }
      return { price, cost, margin: price === 0 ? 0 : (price - cost) / price };
    }
    if (!samplePizza) return null;
    if (mains < (bundle.minMains ?? 1)) return null;
    if (bundle.maxMains && mains > bundle.maxMains) return null;
    const mainsSubtotal = samplePizza.price * mains;
    const mainsCost = (samplePizza.cost ?? 0) * mains;
    let addOnsSubtotal = 0;
    let addOnsCost = 0;
    for (const slot of bundle.composition) {
      const candidate =
        slot.kind === "item"
          ? menu.find((m) => m.available && m.id.endsWith(slot.itemIdSuffix ?? ""))
          : cheapestByCat(slot.category ?? "");
      if (!candidate) return null;
      addOnsSubtotal += candidate.price * slot.quantity;
      addOnsCost += (candidate.cost ?? 0) * slot.quantity;
    }
    const mainsPct = bundle.mainsDiscountPercent ?? bundle.discountPercent ?? 0;
    const addOnsPct = bundle.addOnsDiscountPercent ?? bundle.discountPercent ?? 0;
    const price = Math.round(
      mainsSubtotal * (1 - mainsPct / 100) + addOnsSubtotal * (1 - addOnsPct / 100),
    );
    const cost = mainsCost + addOnsCost;
    const margin = price === 0 ? 0 : (price - cost) / price;
    return { price, cost, margin };
  };

  const samples = isDynamic
    ? [Math.max(2, bundle.minMains ?? 2), Math.max(3, (bundle.minMains ?? 2) + 1)]
        .filter((n, i, a) => a.indexOf(n) === i)
        .map((n) => ({ n, sample: sampleAt(n) }))
    : [{ n: 0, sample: sampleAt(0) }];

  const anyMarginSample = samples.find((s) => s.sample !== null)?.sample;
  if (!anyMarginSample) {
    return (
      <div className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 text-[11px] text-amber-300">
        Margin preview unavailable — composition slots don&rsquo;t resolve at this location&rsquo;s menu.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-emerald-400/20 bg-emerald-400/5 px-2 py-1.5 text-[11px] admin-text-secondary">
      <span className="font-semibold uppercase tracking-wide text-emerald-300">Live margin preview</span>
      <span className="mx-1 text-slate-500">·</span>
      {samples.map(({ n, sample }, i) => (
        <span key={n}>
          {i > 0 && <span className="mx-1 text-slate-600">·</span>}
          {isDynamic && <span className="text-slate-400">@{n} mains</span>}{" "}
          <span className="admin-text">
            {sample ? `zł ${(sample.price / 100).toFixed(2)}` : "—"}
          </span>{" "}
          <span
            className={
              sample && sample.margin >= 0.4
                ? "text-emerald-300 font-semibold"
                : sample && sample.margin >= 0.25
                  ? "text-amber-300 font-semibold"
                  : "text-red-300 font-semibold"
            }
          >
            {sample ? `${Math.round(sample.margin * 100)}% margin` : ""}
          </span>
        </span>
      ))}
      <p className="text-[10px] text-slate-500 mt-0.5">
        Uses MenuItem.cost + cheapest-add-on per slot. Margin below 40% = re-check; below 25% = bleeding.
      </p>
    </div>
  );
}

function CompositionEditor({
  composition,
  excludeCategories = [],
  onChange,
}: {
  composition: BundleSlotConfig[];
  /** Categories to hide from the "Any of" dropdown — used in dynamic mode
   *  so the admin can't pick pizza/pasta in the static composition (the
   *  bundle's main categories scale via the cart, not the slot). */
  excludeCategories?: string[];
  onChange: (next: BundleSlotConfig[]) => void;
}) {
  const allowedCategories = CATEGORIES.filter((c) => !excludeCategories.includes(c));
  const update = (i: number, patch: Partial<BundleSlotConfig>) => {
    onChange(composition.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const remove = (i: number) => onChange(composition.filter((_, idx) => idx !== i));
  const add = () => {
    const defaultCat = allowedCategories.includes("drinks") ? "drinks" : (allowedCategories[0] ?? "drinks");
    onChange([...composition, { kind: "category", category: defaultCat, quantity: 1 }]);
  };
  return (
    <div className="mt-3">
      <p className="text-[11px] uppercase tracking-wide admin-text-secondary font-semibold mb-1">
        {excludeCategories.length > 0 ? "Static add-ons (mains scale via cart)" : "Composition"}
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
                {allowedCategories.map((c) => (
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
