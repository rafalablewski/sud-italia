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
    return { ...item, ...o };
  });
}

export async function getAvailableMenu(locationSlug: string): Promise<MenuItem[]> {
  const menu = await getMenuWithOverrides(locationSlug);
  return menu.filter((item) => item.available);
}
