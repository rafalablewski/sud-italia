import {
  Pizza,
  Soup,
  Salad,
  Sandwich,
  Wine,
  IceCreamCone,
} from "lucide-react";
import type { MenuCategory } from "./types";

export const CATEGORY_ICONS: Record<MenuCategory, React.ElementType> = {
  pizza: Pizza,
  pasta: Soup,
  antipasti: Salad,
  panini: Sandwich,
  drinks: Wine,
  desserts: IceCreamCone,
};

export const CATEGORY_COLORS: Record<MenuCategory, string> = {
  pizza: "bg-red-50 text-italia-red",
  pasta: "bg-amber-50 text-amber-600",
  antipasti: "bg-green-50 text-italia-green",
  panini: "bg-orange-50 text-orange-600",
  drinks: "bg-purple-50 text-purple-600",
  desserts: "bg-pink-50 text-pink-600",
};
