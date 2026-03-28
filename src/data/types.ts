export interface Location {
  slug: string;
  name: string;
  city: string;
  address: string;
  coordinates: { lat: number; lng: number };
  heroImage: string;
  description: string;
  shortDescription: string;
  hours: { day: string; open: string; close: string }[];
  isActive: boolean;
  currency: "PLN";
}

export type MenuCategory =
  | "pizza"
  | "pasta"
  | "antipasti"
  | "panini"
  | "drinks"
  | "desserts";

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  pizza: "Pizza",
  pasta: "Pasta",
  antipasti: "Antipasti",
  panini: "Panini",
  drinks: "Drinks",
  desserts: "Desserts",
};

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // in grosze (1/100 PLN), e.g. 2500 = 25.00 PLN
  category: MenuCategory;
  image?: string;
  tags: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[];
  available: boolean;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  locationSlug: string;
}

export interface Order {
  id: string;
  locationSlug: string;
  items: CartItem[];
  totalAmount: number;
  status: "pending" | "confirmed" | "preparing" | "ready";
  customerName: string;
  customerPhone: string;
  createdAt: string;
}
