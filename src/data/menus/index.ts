import { MenuItem } from "../types";
import { krakowMenu } from "./krakow";
import { warszawaMenu } from "./warszawa";

const menus: Record<string, MenuItem[]> = {
  krakow: krakowMenu,
  warszawa: warszawaMenu,
};

export function getMenu(locationSlug: string): MenuItem[] {
  return menus[locationSlug] ?? [];
}

export function getAvailableMenu(locationSlug: string): MenuItem[] {
  return getMenu(locationSlug).filter((item) => item.available);
}
