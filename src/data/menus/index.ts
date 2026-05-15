import { MenuItem } from "../types";
import { krakowMenu } from "./krakow";
import { warszawaMenu } from "./warszawa";
import { getMenuOverrides } from "@/lib/store";

const baseMenus: Record<string, MenuItem[]> = {
  krakow: krakowMenu,
  warszawa: warszawaMenu,
};

export function getMenu(locationSlug: string): MenuItem[] {
  return baseMenus[locationSlug] ?? [];
}

export async function getMenuWithOverrides(locationSlug: string): Promise<MenuItem[]> {
  const base = getMenu(locationSlug);
  const overrides = await getMenuOverrides();
  return base.map((item) => {
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
  });
}

export async function getAvailableMenu(locationSlug: string): Promise<MenuItem[]> {
  const menu = await getMenuWithOverrides(locationSlug);
  return menu.filter((item) => item.available);
}
