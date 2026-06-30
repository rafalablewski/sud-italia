import type {
  LocationDTO,
  MenuItemDTO,
  ModifierGroup,
  SelectedModifier,
} from "@/api/types";

/**
 * Menu + modifier pure helpers — the native analogue of the web `upsell.ts`
 * modifier math + the menu page's category/dietary/open-now logic. Kept
 * dependency-free so screens and the cart store share one source of truth.
 */

/** Display order for category sections (pizza-led, Ottaviano house style). */
export const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

export const CATEGORY_LABELS: Record<string, string> = {
  pizza: "Pizza",
  pasta: "Pasta",
  antipasti: "Antipasti",
  panini: "Panini",
  drinks: "Drinks",
  desserts: "Dolci",
};

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i < 0 ? 99 : i;
}

// ── Dietary signals (read off the item's tags) ─────────────────────────────

export type Diet = "vegetarian" | "vegan" | "gluten-free" | "spicy";

const DIET_TAGS: Record<Diet, { label: string; tone: "ok" | "warn" }> = {
  vegetarian: { label: "Vegetariano", tone: "ok" },
  vegan: { label: "Vegano", tone: "ok" },
  "gluten-free": { label: "Senza glutine", tone: "ok" },
  spicy: { label: "Piccante", tone: "warn" },
};

export function dietBadges(item: MenuItemDTO): { key: Diet; label: string; tone: "ok" | "warn" }[] {
  const tags = item.tags.map((t) => t.toLowerCase());
  const out: { key: Diet; label: string; tone: "ok" | "warn" }[] = [];
  (Object.keys(DIET_TAGS) as Diet[]).forEach((d) => {
    const hit = d === "gluten-free" ? tags.some((t) => t === "gluten-free" || t === "gf") : tags.includes(d);
    if (hit) out.push({ key: d, label: DIET_TAGS[d].label, tone: DIET_TAGS[d].tone });
  });
  return out;
}

// ── Modifier math (mirrors web effectiveUnitPrice / cartLineKey) ───────────

/** Resolve the surcharge (grosze) a set of selected options adds to a line. */
export function modifierDelta(item: MenuItemDTO, selected: SelectedModifier[]): number {
  if (selected.length === 0) return 0;
  let delta = 0;
  for (const group of item.modifierGroups) {
    for (const opt of group.options) {
      const picked = selected.some((s) => s.groupId === group.id && s.optionId === opt.id);
      // Negative deltas are clamped to 0 — we never credit a refund via a pick.
      if (picked) delta += Math.max(0, opt.priceDelta);
    }
  }
  return delta;
}

/** Unit price including modifier surcharges. */
export function effectiveUnitPrice(item: MenuItemDTO, selected: SelectedModifier[]): number {
  return item.price + modifierDelta(item, selected);
}

/** Stable key for a cart line: item id + the sorted chosen option ids, so each
 *  modifier variant of a dish stacks as its own line (web `cartLineKey`). */
export function cartLineKey(itemId: string, selected: SelectedModifier[]): string {
  if (selected.length === 0) return itemId;
  const ids = selected.map((s) => s.optionId).slice().sort();
  return `${itemId}::${ids.join(",")}`;
}

/** Human labels for a line's chosen options ("Sourdough", "Extra cheese"). */
export function modifierLabels(item: MenuItemDTO, selected: SelectedModifier[]): string[] {
  const out: string[] = [];
  for (const s of selected) {
    const group = item.modifierGroups.find((g) => g.id === s.groupId);
    const opt = group?.options.find((o) => o.id === s.optionId);
    if (opt) out.push(opt.label);
  }
  return out;
}

export function isGroupRequired(group: ModifierGroup): boolean {
  return (group.minSelections ?? 0) >= 1;
}

export function isMultiSelect(group: ModifierGroup): boolean {
  return (group.maxSelections ?? 1) > 1;
}

/** A dish needs the detail sheet (vs one-tap add) only when it carries a
 *  required modifier group the customer must resolve first. */
export function needsConfiguration(item: MenuItemDTO): boolean {
  return item.modifierGroups.some(isGroupRequired);
}

/** Seed required single-select groups with their first option (the "Standard"
 *  default), exactly like the web detail drawer. */
export function defaultSelections(item: MenuItemDTO): SelectedModifier[] {
  const out: SelectedModifier[] = [];
  for (const g of item.modifierGroups) {
    if (isGroupRequired(g) && !isMultiSelect(g) && g.options[0]) {
      out.push({ groupId: g.id, optionId: g.options[0].id });
    }
  }
  return out;
}

/** Every required group has at least its minimum picks — gates the add CTA. */
export function requiredGroupsSatisfied(item: MenuItemDTO, selected: SelectedModifier[]): boolean {
  return item.modifierGroups.every((g) => {
    if (!isGroupRequired(g)) return true;
    const count = selected.filter((s) => s.groupId === g.id).length;
    return count >= (g.minSelections ?? 1);
  });
}

// ── Live "open now" (reads the location's hours array) ─────────────────────

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Whether a location is currently within service hours, and today's close
 *  time — drives the menu header status pill (Rule #1, real time-of-day). */
export function locationOpen(
  loc: LocationDTO | null | undefined,
  now: Date = new Date(),
): { open: boolean; closeLabel: string | null } {
  if (!loc?.hours?.length) return { open: false, closeLabel: null };
  const dayKey = DAY_KEYS[now.getDay()];
  const today = loc.hours.find((h) => h.day.toLowerCase().startsWith(dayKey.slice(0, 3)));
  if (!today) return { open: false, closeLabel: null };
  const mins = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = mins(today.open);
  const closeMin = mins(today.close);
  const open = nowMin >= openMin && nowMin < closeMin;
  return { open, closeLabel: open ? today.close : null };
}
