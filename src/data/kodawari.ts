// Kodawari (こだわり) — obsessive attention to detail
// Full nutritional info, allergen matrix, and sourcing for every menu item

import { Allergen, NutritionInfo } from "./types";

interface ItemDetail {
  allergens: Allergen[];
  nutrition: NutritionInfo;
  sourcing: string;
  prepTimeMinutes: number;
}

export const ITEM_DETAILS: Record<string, ItemDetail> = {
  // === KRAKOW PIZZAS ===
  "krk-pizza-margherita": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 720, protein: 28, carbs: 82, fat: 30, fiber: 4, sodium: 1200 },
    sourcing: "San Marzano DOP tomatoes from Campania, fior di latte from Agerola, Tipo 00 flour from Caputo, Naples",
    prepTimeMinutes: 8,
  },
  "krk-pizza-diavola": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 810, protein: 32, carbs: 80, fat: 38, fiber: 3, sodium: 1650 },
    sourcing: "Salame calabrese from Calabria, San Marzano DOP tomatoes, Calabrian chili oil",
    prepTimeMinutes: 8,
  },
  "krk-pizza-prosciutto": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 780, protein: 36, carbs: 78, fat: 34, fiber: 2, sodium: 1500 },
    sourcing: "Prosciutto crudo di Parma DOP (24-month aged), wild arugula, Parmigiano Reggiano DOP",
    prepTimeMinutes: 9,
  },
  "krk-pizza-quattro-formaggi": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 890, protein: 38, carbs: 76, fat: 48, fiber: 2, sodium: 1400 },
    sourcing: "Gorgonzola DOP from Lombardy, fontina from Valle d'Aosta, Parmigiano Reggiano 36-month",
    prepTimeMinutes: 9,
  },
  "krk-pizza-ortolana": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 650, protein: 24, carbs: 84, fat: 22, fiber: 6, sodium: 980 },
    sourcing: "Seasonal vegetables from local Polish farms, basil pesto with Ligurian pine nuts",
    prepTimeMinutes: 10,
  },

  // === KRAKOW PASTA ===
  "krk-pasta-carbonara": {
    allergens: ["gluten", "dairy", "eggs"],
    nutrition: { calories: 820, protein: 32, carbs: 68, fat: 44, fiber: 3, sodium: 1100 },
    sourcing: "Guanciale from Amatrice, Pecorino Romano DOP, free-range eggs from local farms",
    prepTimeMinutes: 12,
  },
  "krk-pasta-arrabbiata": {
    allergens: ["gluten"],
    nutrition: { calories: 480, protein: 14, carbs: 76, fat: 12, fiber: 5, sodium: 680 },
    sourcing: "San Marzano tomatoes, Calabrian peperoncino, Italian extra virgin olive oil",
    prepTimeMinutes: 10,
  },
  "krk-pasta-pesto": {
    allergens: ["gluten", "dairy", "nuts"],
    nutrition: { calories: 720, protein: 22, carbs: 70, fat: 38, fiber: 4, sodium: 750 },
    sourcing: "Fresh Genovese basil, Ligurian pine nuts, Parmigiano Reggiano DOP, Taggiasca olive oil",
    prepTimeMinutes: 10,
  },
  "krk-pasta-bolognese": {
    allergens: ["gluten", "dairy", "celery"],
    nutrition: { calories: 780, protein: 36, carbs: 72, fat: 36, fiber: 4, sodium: 1050 },
    sourcing: "Polish grass-fed beef & pork, San Marzano tomatoes, fresh egg tagliatelle made daily",
    prepTimeMinutes: 15,
  },

  // === KRAKOW ANTIPASTI ===
  "krk-anti-bruschetta": {
    allergens: ["gluten"],
    nutrition: { calories: 280, protein: 6, carbs: 32, fat: 14, fiber: 3, sodium: 420 },
    sourcing: "Ciabatta baked in-house daily, vine-ripened tomatoes, Italian EVOO",
    prepTimeMinutes: 5,
  },
  "krk-anti-burrata": {
    allergens: ["dairy"],
    nutrition: { calories: 380, protein: 18, carbs: 12, fat: 28, fiber: 2, sodium: 380 },
    sourcing: "Burrata di Andria from Puglia (flown in weekly), aged Modena balsamic",
    prepTimeMinutes: 5,
  },
  "krk-anti-arancini": {
    allergens: ["gluten", "dairy", "eggs"],
    nutrition: { calories: 520, protein: 16, carbs: 58, fat: 24, fiber: 2, sodium: 780 },
    sourcing: "Carnaroli rice from Piedmont, house-made ragù, fior di latte mozzarella",
    prepTimeMinutes: 7,
  },

  // === KRAKOW PANINI ===
  "krk-panini-caprese": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 480, protein: 20, carbs: 42, fat: 24, fiber: 3, sodium: 680 },
    sourcing: "Fresh mozzarella, vine-ripened tomatoes, Genovese basil, ciabatta baked daily",
    prepTimeMinutes: 5,
  },
  "krk-panini-salame": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 560, protein: 26, carbs: 44, fat: 30, fiber: 2, sodium: 1200 },
    sourcing: "Salame Milano, provolone from Campania, roasted peppers, focaccia baked daily",
    prepTimeMinutes: 5,
  },

  // === KRAKOW DRINKS ===
  "krk-drink-limonata": {
    allergens: [],
    nutrition: { calories: 120, protein: 0, carbs: 30, fat: 0, fiber: 0, sodium: 10 },
    sourcing: "Fresh Sicilian lemons, raw cane sugar, fresh mint from Polish herb garden",
    prepTimeMinutes: 2,
  },
  "krk-drink-aranciata": {
    allergens: [],
    nutrition: { calories: 140, protein: 0, carbs: 34, fat: 0, fiber: 0, sodium: 15 },
    sourcing: "San Pellegrino, imported from Italy",
    prepTimeMinutes: 1,
  },
  "krk-drink-water": {
    allergens: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 5 },
    sourcing: "Mineral water from Polish natural springs",
    prepTimeMinutes: 1,
  },
  "krk-drink-espresso": {
    allergens: [],
    nutrition: { calories: 5, protein: 0, carbs: 1, fat: 0, fiber: 0, sodium: 2 },
    sourcing: "Arabica blend roasted by Caffè Moak, Sicily",
    prepTimeMinutes: 2,
  },

  // === KRAKOW DESSERTS ===
  "krk-dessert-tiramisu": {
    allergens: ["gluten", "dairy", "eggs"],
    nutrition: { calories: 420, protein: 8, carbs: 44, fat: 24, fiber: 1, sodium: 180 },
    sourcing: "Mascarpone from Lombardy, savoiardi from Vicenzi, espresso from Caffè Moak",
    prepTimeMinutes: 3,
  },
  "krk-dessert-cannoli": {
    allergens: ["gluten", "dairy", "eggs", "nuts"],
    nutrition: { calories: 380, protein: 10, carbs: 38, fat: 22, fiber: 1, sodium: 160 },
    sourcing: "Ricotta from Sicily, Bronte pistachios DOP, pastry shells made daily",
    prepTimeMinutes: 3,
  },
  "krk-dessert-panna-cotta": {
    allergens: ["dairy"],
    nutrition: { calories: 340, protein: 6, carbs: 32, fat: 22, fiber: 1, sodium: 90 },
    sourcing: "Bourbon vanilla beans from Madagascar, cream from Polish dairy farms, wild berry coulis",
    prepTimeMinutes: 2,
  },

  // === WARSAW PIZZAS ===
  "waw-pizza-margherita": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 740, protein: 28, carbs: 84, fat: 32, fiber: 4, sodium: 1250 },
    sourcing: "San Marzano DOP tomatoes, fior di latte from Agerola, Tipo 00 Caputo flour",
    prepTimeMinutes: 8,
  },
  "waw-pizza-diavola": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 830, protein: 34, carbs: 82, fat: 40, fiber: 3, sodium: 1700 },
    sourcing: "Calabrian salame, San Marzano DOP, chili oil pressed in Calabria",
    prepTimeMinutes: 8,
  },
  "waw-pizza-prosciutto": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 800, protein: 38, carbs: 80, fat: 36, fiber: 2, sodium: 1550 },
    sourcing: "Prosciutto crudo di Parma DOP, Parmigiano Reggiano 36-month, wild arugula",
    prepTimeMinutes: 9,
  },
  "waw-pizza-quattro-formaggi": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 910, protein: 40, carbs: 78, fat: 50, fiber: 2, sodium: 1450 },
    sourcing: "Four Italian cheeses: gorgonzola DOP, fontina, mozzarella, Parmigiano Reggiano",
    prepTimeMinutes: 9,
  },
  "waw-pizza-napoli": {
    allergens: ["gluten", "dairy", "fish"],
    nutrition: { calories: 690, protein: 30, carbs: 80, fat: 26, fiber: 3, sodium: 1800 },
    sourcing: "Cantabrian anchovies, Pantelleria capers, San Marzano DOP, Sicilian oregano",
    prepTimeMinutes: 8,
  },
  "waw-pizza-bufala": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 780, protein: 32, carbs: 78, fat: 36, fiber: 3, sodium: 1100 },
    sourcing: "Mozzarella di Bufala Campana DOP (flown in twice weekly), San Marzano DOP",
    prepTimeMinutes: 8,
  },

  // === WARSAW PASTA ===
  "waw-pasta-carbonara": {
    allergens: ["gluten", "dairy", "eggs"],
    nutrition: { calories: 840, protein: 34, carbs: 70, fat: 46, fiber: 3, sodium: 1150 },
    sourcing: "Guanciale from Amatrice, Pecorino Romano DOP, free-range eggs",
    prepTimeMinutes: 12,
  },
  "waw-pasta-cacio-pepe": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 680, protein: 24, carbs: 68, fat: 34, fiber: 3, sodium: 950 },
    sourcing: "Pecorino Romano DOP aged 12 months, Tellicherry black pepper, tonnarelli made fresh",
    prepTimeMinutes: 10,
  },
  "waw-pasta-amatriciana": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 760, protein: 28, carbs: 72, fat: 38, fiber: 4, sodium: 1200 },
    sourcing: "Guanciale, San Marzano tomatoes, Pecorino Romano DOP, bucatini from Gragnano",
    prepTimeMinutes: 12,
  },
  "waw-pasta-pesto": {
    allergens: ["gluten", "dairy", "nuts"],
    nutrition: { calories: 740, protein: 22, carbs: 72, fat: 40, fiber: 4, sodium: 780 },
    sourcing: "Genovese basil DOP, Ligurian pine nuts, Parmigiano Reggiano, Taggiasca EVOO",
    prepTimeMinutes: 10,
  },

  // === WARSAW ANTIPASTI ===
  "waw-anti-bruschetta": {
    allergens: ["gluten"],
    nutrition: { calories: 290, protein: 6, carbs: 34, fat: 14, fiber: 3, sodium: 440 },
    sourcing: "Ciabatta baked in-house, vine-ripened tomatoes, Italian EVOO",
    prepTimeMinutes: 5,
  },
  "waw-anti-burrata": {
    allergens: ["dairy"],
    nutrition: { calories: 440, protein: 24, carbs: 14, fat: 32, fiber: 2, sodium: 520 },
    sourcing: "Burrata from Puglia, prosciutto di Parma DOP, Italian peaches, aged balsamic",
    prepTimeMinutes: 5,
  },
  "waw-anti-calamari": {
    allergens: ["gluten", "eggs", "molluscs"],
    nutrition: { calories: 380, protein: 18, carbs: 28, fat: 22, fiber: 1, sodium: 680 },
    sourcing: "Mediterranean calamari, Tipo 00 flour batter, house-made lemon aioli",
    prepTimeMinutes: 7,
  },

  // === WARSAW PANINI ===
  "waw-panini-porchetta": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 620, protein: 32, carbs: 46, fat: 34, fiber: 3, sodium: 1300 },
    sourcing: "Slow-roasted porchetta (8-hour), broccoli rabe, provolone, Calabrian chili oil",
    prepTimeMinutes: 5,
  },
  "waw-panini-caprese": {
    allergens: ["gluten", "dairy"],
    nutrition: { calories: 490, protein: 20, carbs: 44, fat: 26, fiber: 3, sodium: 700 },
    sourcing: "Fresh mozzarella, vine tomatoes, Genovese basil, ciabatta baked daily",
    prepTimeMinutes: 5,
  },

  // === WARSAW DRINKS ===
  "waw-drink-limonata": {
    allergens: [],
    nutrition: { calories: 130, protein: 0, carbs: 32, fat: 0, fiber: 0, sodium: 10 },
    sourcing: "Sicilian lemons, raw cane sugar, fresh mint",
    prepTimeMinutes: 2,
  },
  "waw-drink-aranciata": {
    allergens: [],
    nutrition: { calories: 140, protein: 0, carbs: 34, fat: 0, fiber: 0, sodium: 15 },
    sourcing: "San Pellegrino, imported from Italy",
    prepTimeMinutes: 1,
  },
  "waw-drink-water": {
    allergens: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 5 },
    sourcing: "Polish natural spring mineral water",
    prepTimeMinutes: 1,
  },
  "waw-drink-espresso": {
    allergens: [],
    nutrition: { calories: 5, protein: 0, carbs: 1, fat: 0, fiber: 0, sodium: 2 },
    sourcing: "Arabica blend by Caffè Moak, Sicily",
    prepTimeMinutes: 2,
  },

  // === WARSAW DESSERTS ===
  "waw-dessert-tiramisu": {
    allergens: ["gluten", "dairy", "eggs"],
    nutrition: { calories: 440, protein: 8, carbs: 46, fat: 26, fiber: 1, sodium: 190 },
    sourcing: "Mascarpone from Lombardy, Caffè Moak espresso, Vicenzi savoiardi",
    prepTimeMinutes: 3,
  },
  "waw-dessert-cannoli": {
    allergens: ["gluten", "dairy", "eggs", "nuts"],
    nutrition: { calories: 390, protein: 10, carbs: 40, fat: 22, fiber: 1, sodium: 170 },
    sourcing: "Sicilian ricotta, Bronte pistachios DOP, dark chocolate from Modica",
    prepTimeMinutes: 3,
  },
};

export function getItemDetails(itemId: string): ItemDetail | null {
  return ITEM_DETAILS[itemId] || null;
}
