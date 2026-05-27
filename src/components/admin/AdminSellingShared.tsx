"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  Button,
  Chip,
  IconButton,
  Select,
  Switch,
  Tag,
  useToast,
} from "./v2/ui";
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
  /** Channel restriction (audit §3). Unset = both channels; "dine-in"
   *  = truck only; "delivery" = delivery only. */
  channel?: "dine-in" | "delivery";
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
  /** Scarcity / time-pressure framing — ISO date (YYYY-MM-DD). When
   *  present and in the future, the chip shows a "limited until <date>"
   *  badge. Past dates auto-deactivate the bundle. */
  limitedUntil?: string;
  /** Per-day-of-week visibility. Lower-case English day names; when
   *  unset, the bundle is available all week. When set, the bundle is
   *  only surfaced when the local weekday matches one of these. */
  activeDays?: string[];
  /** Channel restriction (audit §3). Unset = both channels; "dine-in"
   *  = truck only; "delivery" = delivery only. */
  channel?: "dine-in" | "delivery";
  /** Member-exclusive pricing (audit §3 — drives phone collection as
   *  active conversion lever). When true, hidden from anonymous carts. */
  membersOnly?: boolean;
}

/** Experiment shape (Sprint 6 #1). Mirrors src/lib/experiments.ts at the
 *  admin layer with loose `string[]` types so JSON round-trips cleanly. */
export interface ExperimentVariantConfig {
  id: string;
  label: string;
  weight: number;
  bundleOverrides?: Record<
    string,
    | number
    | { mainsDiscountPercent?: number; addOnsDiscountPercent?: number; discountPercent?: number }
  >;
}
export interface ExperimentConfig {
  id: string;
  name: string;
  active: boolean;
  variants: ExperimentVariantConfig[];
}

export interface BundleRulesConfig {
  lunch: { startHour: number; endHour: number };
  family: { minMainItems: number; hintWithin: number };
}

export interface LocationConfig {
  popularItems: string[];
  staffPicks: string[];
  /** Editorial menu badges (Hero / Pizzaiolo's Choice / Chef's Signature /
   *  New) managed from the Menu badges tab. Optional for back-compat with
   *  saved configs that pre-date the consolidation. */
  heroItems?: string[];
  pizzaioloChoiceItems?: string[];
  chefSignatureItems?: string[];
  newItems?: string[];
  preferredCoffee: string;
  preferredDessert: string;
  preferredDrink: string;
  /** Audit §3 — fourth "Complete your meal" slot (Garlic Bread by default). */
  preferredGarlicBread?: string;
  combos: ComboDealConfig[];
  timeWindows?: TimeWindowConfig[];
  bundleRules?: BundleRulesConfig;
  bundles?: BundleConfig[];
  /** Single active per-location A/B experiment (Sprint 6 #1). Resolver
   *  in src/lib/experiments.ts phone-hashes assignment so client and
   *  server agree on the same variant for the same customer. */
  experiment?: ExperimentConfig | null;
}

export type AllSettings = Record<string, LocationConfig>;

/** Shape of a row from `/api/admin/menu?location=<slug>` — a full MenuItem
 *  with overrides + custom items already merged in, plus the admin-only
 *  `_hidden` soft-delete flag we filter on so deleted items disappear from
 *  the pickers. */
type LiveMenuItem = MenuItem & { _hidden?: boolean };

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
  // Audit §3 — family minimum 3 (was 2/5; 2 cannibalised couple orders,
  // 5 admin default was unreachable). New default aligns with runtime.
  family: { minMainItems: 3, hintWithin: 1 },
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
      preferredGarlicBread: "krk-anti-garlic-bread",
      preferredDrink: "krk-drink-limonata",
      combos: DEFAULT_COMBOS.map((c) => ({ ...c })),
    };
  }
  return {
    popularItems: ["waw-pizza-margherita", "waw-pizza-bufala", "waw-pasta-carbonara", "waw-dessert-tiramisu", "waw-drink-limonata"],
    staffPicks: ["waw-pizza-napoli", "waw-anti-burrata", "waw-pasta-cacio-pepe"],
    preferredCoffee: "waw-drink-espresso",
    preferredDessert: "waw-dessert-tiramisu",
    preferredGarlicBread: "waw-anti-garlic-bread",
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
  // Live per-location menu (seed + custom items + overrides), keyed by slug.
  // Populated from /api/admin/menu so the item pickers reflect exactly what
  // operators have added / renamed / 86'd in /admin/menu — not the static
  // seed catalogue. A slug stays absent until its fetch succeeds, which is
  // the signal to fall back to the seed menu for that location.
  const [liveMenus, setLiveMenus] = useState<Record<string, MenuItem[]>>({});
  const [activeLocation, setActiveLocation] = useState(LOCATIONS[0].slug);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const r = await fetch("/api/admin/upsell");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setSettings(data || {});
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load settings");
        }
      }
    };

    // Live menus load independently of settings: a menu-fetch failure for one
    // location just falls back to that location's seed catalogue (the picker
    // still works) rather than blocking edits or wiping production settings.
    const loadMenus = async () => {
      const entries = await Promise.all(
        LOCATIONS.map(async (l) => {
          try {
            const r = await fetch(`/api/admin/menu?location=${l.slug}`);
            if (!r.ok) return null;
            const items = (await r.json()) as LiveMenuItem[];
            return [l.slug, items.filter((m) => !m._hidden)] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, MenuItem[]> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setLiveMenus(next);
    };

    Promise.allSettled([loadSettings(), loadMenus()]).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const baseLoc = LOCATIONS.find((l) => l.slug === activeLocation) ?? LOCATIONS[0];
  const liveMenu = liveMenus[activeLocation];
  const loc = liveMenu ? { ...baseLoc, menu: liveMenu } : baseLoc;
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
  intrinsicIds,
  intrinsicHint,
}: {
  items: MenuItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  /** Items badged from a non-admin source (menu data `menuRole`, location
   *  defaults). Shown as locked chips so admins see the live homepage state
   *  even when the editable list is empty. Editing requires changing the
   *  upstream source. */
  intrinsicIds?: string[];
  /** Tooltip text on the lock icon next to each intrinsic chip. */
  intrinsicHint?: string;
}) {
  const [adding, setAdding] = useState(false);
  // O(1) id → item lookup so the chip + picker loops below don't re-scan
  // `items` on every render (called once per badge category × every keystroke
  // in a sibling field, since the parent re-renders on any settings edit).
  const itemsById = useMemo(() => {
    const m = new Map<string, MenuItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);
  const intrinsicSet = useMemo(() => new Set(intrinsicIds ?? []), [intrinsicIds]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  // Suppress user chips that are already covered by an intrinsic chip to
  // avoid duplicates if a saved config redundantly re-lists a menu-role item.
  const userSelected = selected.filter((id) => !intrinsicSet.has(id));

  return (
    <div>
      <label className="v2-field-label mb-2 block">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {(intrinsicIds ?? []).map((id) => {
          const item = itemsById.get(id);
          return (
            <Tag key={`intrinsic-${id}`} locked title={intrinsicHint} meta={item?.category}>
              {item?.name || id}
            </Tag>
          );
        })}
        {userSelected.map((id) => {
          const item = itemsById.get(id);
          return (
            <Tag
              key={id}
              meta={item?.category}
              onRemove={() => onChange(selected.filter((s) => s !== id))}
              removeLabel={`Remove ${item?.name || id}`}
            >
              {item?.name || id}
            </Tag>
          );
        })}
        {!adding && (
          <Chip className="v2-chip-add" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Add
          </Chip>
        )}
      </div>
      {adding && (
        <div className="glass-card p-3 mb-2 max-h-48 overflow-y-auto">
          {items
            .filter((m) => !selectedSet.has(m.id) && !intrinsicSet.has(m.id))
            .map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onChange([...selected, m.id]);
                  setAdding(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--surface-hover)]"
              >
                <span className="text-xs text-[var(--fg-subtle)] mr-2">[{m.category}]</span>
                {m.name} — {(m.price / 100).toFixed(0)} PLN
              </button>
            ))}
          <button
            onClick={() => setAdding(false)}
            className="block w-full text-left px-3 py-2 text-xs text-[var(--fg-subtle)] hover:text-[var(--fg-muted)]"
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
    <Select
      label={
        <span className="inline-flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
          {label}
        </span>
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">None</option>
      {items.map((m) => (
        <option key={m.id} value={m.id}>
          [{m.category}] {m.name}
        </option>
      ))}
    </Select>
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
        <label className="v2-field-label">Combo Deals</label>
        <Button variant="primary" size="sm" onClick={addCombo} leadingIcon={<Plus className="h-3 w-3" />}>
          Add Combo
        </Button>
      </div>
      <div className="space-y-3">
        {combos.map((combo, i) => (
          <div key={combo.id} className={`glass-card p-4 space-y-3 ${!combo.active ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={combo.active}
                  onChange={(v) => updateCombo(i, { active: v })}
                  label={combo.active ? "Disable combo" : "Enable combo"}
                />
                <input
                  type="text"
                  value={combo.name}
                  onChange={(e) => updateCombo(i, { name: e.target.value })}
                  className="glass-input text-sm font-semibold w-40"
                />
              </div>
              <IconButton
                tone="danger"
                size="sm"
                label="Remove combo"
                onClick={() => removeCombo(i)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
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
                <label className="text-[10px] text-[var(--fg-subtle)] block mb-1">Discount %</label>
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
                <label className="text-[10px] text-[var(--fg-subtle)] block mb-1">Min items</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={combo.minItems}
                  onChange={(e) => updateCombo(i, { minItems: Number(e.target.value) })}
                  className="glass-input text-sm w-20"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--fg-subtle)] block mb-1">Channel</label>
                <select
                  value={combo.channel ?? ""}
                  onChange={(e) =>
                    updateCombo(i, {
                      channel:
                        e.target.value === ""
                          ? undefined
                          : (e.target.value as "dine-in" | "delivery"),
                    })
                  }
                  className="glass-input text-sm"
                >
                  <option value="">Both channels</option>
                  <option value="dine-in">Dine-in only</option>
                  <option value="delivery">Delivery only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-[var(--fg-subtle)] block mb-1.5">Required categories</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => {
                  const selected = combo.categories.includes(cat);
                  return (
                    <Chip
                      key={cat}
                      selected={selected}
                      onClick={() => {
                        const cats = selected
                          ? combo.categories.filter((c) => c !== cat)
                          : [...combo.categories, cat];
                        updateCombo(i, { categories: cats, minItems: Math.min(combo.minItems, cats.length) });
                      }}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      {cat}
                    </Chip>
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
          <p className="text-sm text-[var(--fg-subtle)] text-center py-4">No combo deals configured for this location.</p>
        )}
      </div>
    </div>
  );
}

/** Editor for ComboDealConfig.requiredItems — the item-suffix gating that
 *  drives the Italian Classic Deal pattern (Margherita + Limonata + Tiramisù).
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
      <label className="text-[10px] text-[var(--fg-subtle)] block mb-1.5">
        Specific items required (optional — overrides &ldquo;any of category&rdquo;)
      </label>
      {list.length === 0 ? (
        <p className="text-[11px] text-[var(--fg-subtle)] mb-2">
          Generic combo: any item in the selected categories qualifies. Add a specific item below to lock the deal
          to particular menu items (e.g. Italian Classic = Margherita + Limonata + Tiramisù).
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
                <IconButton
                  size="sm"
                  tone="danger"
                  onClick={() => remove(i)}
                  label="Remove required item"
                >
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
      <Chip className="v2-chip-add" onClick={add} disabled={menu.length === 0}>
        <Plus className="h-3 w-3" /> Add specific item
      </Chip>
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
          <label className="v2-field-label flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[var(--warning)]" />
            Time-of-day Banners
          </label>
          <p className="text-[11px] text-[var(--fg-subtle)] mt-1">
            One banner at a time, picked by local hour. {usingDefaults
              ? "Showing the five hardcoded defaults — edit any row to override."
              : "Override active for this location. Reset to revert."}{" "}
            Audit §2.3.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!usingDefaults && (
            <Button
              variant="secondary"
              size="sm"
              onClick={resetToDefaults}
              title="Discard overrides and use the five defaults"
              leadingIcon={<RotateCcw className="h-3 w-3" />}
            >
              Reset to defaults
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={addWindow} leadingIcon={<Plus className="h-3 w-3" />}>
            Add window
          </Button>
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
                  <IconButton
                    size="sm"
                    onClick={() => toggleExpanded(w.id)}
                    label={isOpen ? "Collapse window" : "Expand window"}
                    aria-expanded={isOpen}
                    className="flex-shrink-0"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </IconButton>
                  <Switch
                    checked={w.active}
                    onChange={(v) => updateWindow(i, { active: v })}
                    label={w.active ? "Disable window" : "Enable window"}
                    className="flex-shrink-0"
                  />

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
                      <div className="flex items-center gap-1 text-xs text-[var(--fg-subtle)] flex-shrink-0">
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
                      className="flex items-center gap-2 min-w-0 text-left hover:text-[var(--fg)] transition-colors"
                      title="Expand to edit"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--warning)] flex-shrink-0">
                        {w.variant}
                      </span>
                      <span className="text-xs text-[var(--fg-subtle)] flex-shrink-0">
                        {w.startHour}–{w.endHour}
                      </span>
                      <span className="text-sm admin-text truncate">
                        {w.title}
                      </span>
                    </button>
                  )}
                </div>
                <IconButton
                  size="sm"
                  tone="danger"
                  onClick={() => removeWindow(i)}
                  label="Remove window"
                  className="flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
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
                      <label className="text-[10px] text-[var(--fg-subtle)] block mb-1">Badge</label>
                      <input
                        type="text"
                        value={w.badge}
                        onChange={(e) => updateWindow(i, { badge: e.target.value })}
                        placeholder="−10% / Quick add / Pre-order"
                        className="glass-input text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--fg-subtle)] block mb-1">CTA</label>
                      <input
                        type="text"
                        value={w.cta}
                        onChange={(e) => updateWindow(i, { cta: e.target.value })}
                        placeholder="Add espresso / How it works"
                        className="glass-input text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--fg-subtle)] block mb-1">
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
          <p className="text-sm text-[var(--fg-subtle)] text-center py-4">
            No windows configured. &ldquo;Add window&rdquo; to create one.
          </p>
        )}
      </div>
    </div>
  );
}

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export function CompositionEditor({
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
            <IconButton size="sm" tone="danger" onClick={() => remove(i)} label="Remove slot">
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </div>
        ))}
        <Chip className="v2-chip-add" onClick={add}>
          <Plus className="h-3 w-3" /> Add slot
        </Chip>
      </div>
    </div>
  );
}

/**
 * A/B experiment editor (Sprint 6 #1). Single active experiment per
 * location with weighted variants and per-bundle discount overrides.
 * Runtime assignment is phone-hashed in src/lib/experiments.ts so the
 * same customer always sees the same variant across visits + the
 * server reproduces it at checkout. Variant ids land in the bundle
 * audit log so BundleAnalyticsCard can show AOV / contribution uplift
 * per variant.
 */
export function ExperimentEditor({
  experiment,
  bundles,
  onChange,
}: {
  experiment: ExperimentConfig | null | undefined;
  bundles: BundleConfig[];
  onChange: (next: ExperimentConfig | null) => void;
}) {
  // Empty-state nudge: ship a starter experiment that the operator can
  // tune. Avoids requiring JSON literacy to set up the first A/B.
  if (!experiment) {
    return (
      <div className="glass-card p-4 space-y-3">
        <div>
          <p className="admin-text font-semibold text-sm">No experiment running</p>
          <p className="text-xs admin-text-secondary mt-1">
            A/B-test discount %s on any dynamic bundle. Variant assignment is phone-hashed so
            customers always see the same variant; the audit log records which one bought what,
            so BundleAnalyticsCard can show AOV uplift per variant.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="w-fit"
          leadingIcon={<Plus className="h-3 w-3" />}
          onClick={() =>
            onChange({
              id: `exp_${Math.random().toString(36).slice(2, 8)}`,
              name: "Family Feast discount A/B",
              active: false,
              variants: [
                { id: "control", label: "Control · 28% blend", weight: 50, bundleOverrides: {} },
                {
                  id: "variant_a",
                  label: "Variant A · 22% blend",
                  weight: 50,
                  bundleOverrides: {
                    "family-feast": { mainsDiscountPercent: 12, addOnsDiscountPercent: 32 },
                  },
                },
              ],
            })
          }
        >
          Start an experiment
        </Button>
      </div>
    );
  }

  const totalWeight = experiment.variants.reduce(
    (s, v) => s + Math.max(0, v.weight),
    0,
  );
  const weightBalanced = totalWeight === 100;

  const update = (patch: Partial<ExperimentConfig>) => {
    onChange({ ...experiment, ...patch });
  };
  const updateVariant = (idx: number, patch: Partial<ExperimentVariantConfig>) => {
    const variants = experiment.variants.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    update({ variants });
  };
  const removeVariant = (idx: number) => {
    update({ variants: experiment.variants.filter((_, i) => i !== idx) });
  };
  const addVariant = () => {
    update({
      variants: [
        ...experiment.variants,
        {
          id: `variant_${experiment.variants.length}`,
          label: `Variant ${String.fromCharCode(65 + experiment.variants.length)}`,
          weight: 0,
          bundleOverrides: {},
        },
      ],
    });
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <input
            className="glass-input w-full font-semibold"
            value={experiment.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Experiment name"
          />
          <p className="text-[10px] admin-text-secondary mt-1">id: {experiment.id}</p>
        </div>
        <label className="flex items-center gap-2 text-xs admin-text-secondary">
          <Switch
            checked={experiment.active}
            onChange={(v) => update({ active: v })}
            label="Toggle experiment active"
          />
          Active
        </label>
        <IconButton tone="danger" size="sm" onClick={() => onChange(null)} label="Delete experiment">
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      {!weightBalanced && (
        <p className="text-[11px] text-[var(--warning)]">
          Variant weights sum to {totalWeight}, not 100. Customers are still bucketed via
          normalized weight, but balance them at 100 for clarity.
        </p>
      )}

      <div className="space-y-3">
        {experiment.variants.map((variant, idx) => (
          <ExperimentVariantRow
            key={variant.id}
            variant={variant}
            bundles={bundles}
            onChange={(patch) => updateVariant(idx, patch)}
            onRemove={() => removeVariant(idx)}
          />
        ))}
      </div>

      <Chip className="v2-chip-add" onClick={addVariant}>
        <Plus className="h-3 w-3" /> Add variant
      </Chip>
    </div>
  );
}

function ExperimentVariantRow({
  variant,
  bundles,
  onChange,
  onRemove,
}: {
  variant: ExperimentVariantConfig;
  bundles: BundleConfig[];
  onChange: (patch: Partial<ExperimentVariantConfig>) => void;
  onRemove: () => void;
}) {
  // Available bundles to override = dynamic bundles. Fixed bundles
  // ignore discount overrides at runtime so the UI hides them.
  const overridableBundles = bundles.filter((b) => (b.pricingMode ?? "fixed") === "dynamic");
  const overrides = variant.bundleOverrides ?? {};

  const setOverride = (bundleId: string, value: ExperimentVariantConfig["bundleOverrides"] extends Record<string, infer V> | undefined ? V : never) => {
    const next = { ...overrides, [bundleId]: value };
    onChange({ bundleOverrides: next });
  };
  const removeOverride = (bundleId: string) => {
    const { [bundleId]: _, ...rest } = overrides;
    onChange({ bundleOverrides: rest });
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-2">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_100px_auto] items-center">
        <input
          className="glass-input"
          value={variant.id}
          onChange={(e) => onChange({ id: e.target.value.replace(/[^a-z0-9_]/g, "").slice(0, 32) })}
          placeholder="variant_id"
        />
        <input
          className="glass-input"
          value={variant.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Display label"
        />
        <label className="flex items-center gap-1 text-xs admin-text-secondary">
          Weight
          <input
            className="glass-input w-16 text-right"
            type="number"
            min={0}
            max={100}
            value={variant.weight}
            onChange={(e) => onChange({ weight: clampHour(Number(e.target.value) || 0, 100) })}
          />
        </label>
        <IconButton size="sm" tone="danger" onClick={onRemove} label="Remove variant">
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide admin-text-secondary mb-1">
          Per-bundle overrides
        </p>
        <div className="space-y-1.5">
          {overridableBundles.length === 0 && (
            <p className="text-[11px] text-[var(--fg-subtle)]">
              No dynamic bundles in this location to override. Configure dynamic-mode bundles first.
            </p>
          )}
          {overridableBundles.map((b) => {
            const o = overrides[b.id];
            const hasOverride = o !== undefined;
            const oObj = typeof o === "object" ? o : undefined;
            const oNumber = typeof o === "number" ? o : undefined;
            return (
              <div key={b.id} className="grid gap-1.5 grid-cols-[1fr_80px_80px_80px_auto] items-center text-xs">
                <span className="admin-text">{b.tier}</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  placeholder="disc %"
                  value={oNumber ?? oObj?.discountPercent ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (v === "") {
                      removeOverride(b.id);
                    } else {
                      setOverride(b.id, Math.max(0, Math.min(50, Number(v) || 0)));
                    }
                  }}
                  className="glass-input text-right"
                />
                <input
                  type="number"
                  min={0}
                  max={50}
                  placeholder="mains %"
                  value={oObj?.mainsDiscountPercent ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    const base = typeof o === "object" ? o : {};
                    if (v === "" && (base.addOnsDiscountPercent === undefined)) {
                      removeOverride(b.id);
                    } else {
                      setOverride(b.id, {
                        ...base,
                        mainsDiscountPercent: v === "" ? undefined : Math.max(0, Math.min(50, Number(v) || 0)),
                      });
                    }
                  }}
                  className="glass-input text-right"
                />
                <input
                  type="number"
                  min={0}
                  max={50}
                  placeholder="addons %"
                  value={oObj?.addOnsDiscountPercent ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    const base = typeof o === "object" ? o : {};
                    if (v === "" && (base.mainsDiscountPercent === undefined)) {
                      removeOverride(b.id);
                    } else {
                      setOverride(b.id, {
                        ...base,
                        addOnsDiscountPercent: v === "" ? undefined : Math.max(0, Math.min(50, Number(v) || 0)),
                      });
                    }
                  }}
                  className="glass-input text-right"
                />
                <span className={`text-[10px] ${hasOverride ? "text-[var(--warning)]" : "text-[var(--fg-disabled)]"}`}>
                  {hasOverride ? "override" : "default"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--fg-subtle)] mt-1">
          Single &ldquo;disc %&rdquo; replaces the blended discount; split mains/add-ons overrides take precedence.
        </p>
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
          <label className="v2-field-label">
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
        <div className="glass-card p-3">
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

        <div className="glass-card p-3">
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
