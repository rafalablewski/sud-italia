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
  cost: number; // food cost in grosze — used for margin/PnL calculations
  category: MenuCategory;
  image?: string;
  tags: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[];
  available: boolean;
}

// --- Ingredients & Recipes ---

export type IngredientCategory =
  | "dairy"
  | "meat"
  | "seafood"
  | "produce"
  | "dry"
  | "sauce"
  | "oil"
  | "spice"
  | "bread"
  | "beverage"
  | "other";

export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  dairy: "Dairy",
  meat: "Meat",
  seafood: "Seafood",
  produce: "Produce",
  dry: "Dry Goods",
  sauce: "Sauces",
  oil: "Oils & Fats",
  spice: "Spices & Herbs",
  bread: "Bread & Dough",
  beverage: "Beverages",
  other: "Other",
};

export type IngredientUnit = "kg" | "g" | "L" | "ml" | "piece" | "bunch" | "can" | "bottle";

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  costPerUnit: number; // grosze per unit (e.g., 2500 = 25.00 PLN per kg)
  supplier?: string;
  notes?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;       // in the ingredient's unit
  wasteFactor: number;    // multiplier, e.g. 1.1 = 10% waste/trimming
}

export interface Recipe {
  id: string;             // e.g. "rcp-a1b2c3d4"
  menuItemId: string;
  ingredients: RecipeIngredient[];
  prepTimeMinutes?: number;
  yieldPortions: number;  // how many servings this recipe makes
  notes?: string;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  locationSlug: string;
}

export type FulfillmentType = "takeout" | "delivery";

export type SlotStatus = "draft" | "active";

export interface TimeSlot {
  id: string;
  locationSlug: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  maxOrders: number;
  currentOrders: number;
  fulfillmentTypes: FulfillmentType[]; // which types this slot supports
  status: SlotStatus; // "draft" until admin approves, then "active"
}

export interface Order {
  id: string;
  locationSlug: string;
  items: CartItem[];
  totalAmount: number;
  status: "pending" | "confirmed" | "preparing" | "ready" | "completed";
  customerName: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress?: string;
  slotId: string;
  slotDate: string;
  slotTime: string;
  createdAt: string;
  paidAt?: string;
}
