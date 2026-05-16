import { MenuItem } from "../types";
import { krakowMenu } from "./krakow";
import { warszawaMenu } from "./warszawa";
import { getCustomMenuItems, getMenuOverrides } from "@/lib/store";

const baseMenus: Record<string, MenuItem[]> = {
  krakow: krakowMenu,
  warszawa: warszawaMenu,
};

export function getMenu(locationSlug: string): MenuItem[] {
  return baseMenus[locationSlug] ?? [];
}

export async function getMenuWithOverrides(locationSlug: string): Promise<MenuItem[]> {
  const base = getMenu(locationSlug);
  const [overrides, customItems] = await Promise.all([
    getMenuOverrides(),
    getCustomMenuItems(locationSlug),
  ]);
  const applyOverride = (item: MenuItem): MenuItem => {
    const o = overrides[item.id];
    if (!o) return item;
    // Merge with `null = clear` semantics so admin can demote a hero or
    // turn off an LTO without redeploying. Plain shallow-merge would set
    // the field to null; deleting it lets the renderer fall back to
    // "no role" / "not limited" without any extra null-checks.
    const merged: Record<string, unknown> = { ...item };
    for (const [k, v] of Object.entries(o)) {
      if (v === null) delete merged[k];
      else if (v !== undefined) merged[k] = v;
    }
    return merged as unknown as MenuItem;
  };
  const merged = base.map(applyOverride);
  // Admin-created items live alongside the seed catalogue. Same override
  // pipeline applies so an operator can still 86 a custom item or tweak
  // its price without re-creating the row.
  for (const custom of customItems) {
    // Strip the storage-only fields so the consumer never sees them.
    const { locationSlug: _loc, createdAt: _c, updatedAt: _u, ...item } = custom;
    void _loc; void _c; void _u;
    merged.push(applyOverride(item as MenuItem));
  }
  // Soft-deleted rows (`override.hidden === true`) are filtered out for
  // the customer + ops surfaces. The admin /api/admin/menu endpoint
  // surfaces them with a `_hidden` flag so they can be restored via the
  // "Show hidden" toggle.
  return merged.filter((item) => {
    const o = overrides[item.id];
    return !(o && o.hidden === true);
  });
}

export async function getAvailableMenu(locationSlug: string): Promise<MenuItem[]> {
  const menu = await getMenuWithOverrides(locationSlug);
  return menu.filter((item) => item.available);
}
