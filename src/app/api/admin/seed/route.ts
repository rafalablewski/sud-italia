import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { saveIngredient, saveRecipe, getIngredients } from "@/lib/store";
import type { Ingredient, Recipe } from "@/data/types";

// Seed data: ingredients with avg Polish market prices (2026)
const SEED_INGREDIENTS: Ingredient[] = [
  {
    id: "ing-flour-00",
    name: "Caputo 00 Flour",
    category: "dry",
    unit: "kg",
    costPerUnit: 800,   // 8.00 PLN/kg
    supplier: "Caputo import",
    notes: "Tipo 00 pizza flour",
  },
  {
    id: "ing-san-marzano",
    name: "San Marzano Tomatoes (canned)",
    category: "sauce",
    unit: "can",
    costPerUnit: 1200,  // 12.00 PLN/can (400g)
    supplier: "Italian import",
    notes: "DOP certified, 400g can",
  },
  {
    id: "ing-fior-di-latte",
    name: "Fior di Latte Mozzarella",
    category: "dairy",
    unit: "kg",
    costPerUnit: 4500,  // 45.00 PLN/kg
    supplier: "Local dairy",
    notes: "Fresh, high moisture",
  },
  {
    id: "ing-fresh-basil",
    name: "Fresh Basil",
    category: "spice",
    unit: "bunch",
    costPerUnit: 400,   // 4.00 PLN/bunch
    supplier: "Local market",
    notes: "~30g per bunch",
  },
  {
    id: "ing-evoo",
    name: "Extra Virgin Olive Oil",
    category: "oil",
    unit: "L",
    costPerUnit: 4000,  // 40.00 PLN/L
    supplier: "Italian import",
    notes: "Cold-pressed, Italian origin",
  },
  {
    id: "ing-sea-salt",
    name: "Sea Salt",
    category: "spice",
    unit: "kg",
    costPerUnit: 600,   // 6.00 PLN/kg
    supplier: "",
    notes: "Fine grain",
  },
  {
    id: "ing-dry-yeast",
    name: "Dry Yeast",
    category: "dry",
    unit: "kg",
    costPerUnit: 3500,  // 35.00 PLN/kg
    supplier: "",
    notes: "Instant dry yeast",
  },
  {
    id: "ing-sugar",
    name: "Sugar",
    category: "dry",
    unit: "kg",
    costPerUnit: 400,   // 4.00 PLN/kg
    supplier: "",
    notes: "White granulated",
  },
];

// Margherita recipe for Kraków location
// Dough: 250g flour, 150ml water, 5g salt, 2g yeast, 3g sugar, 10ml olive oil → makes 1 pizza base
// Sauce: ~80g San Marzano (about 1/5 can)
// Topping: 125g fior di latte, 3-4 basil leaves (~1/10 bunch), 10ml EVOO drizzle
const MARGHERITA_RECIPE: Omit<Recipe, "id"> = {
  menuItemId: "krk-pizza-margherita",
  yieldPortions: 1,
  prepTimeMinutes: 15,
  notes: "Hand-stretched, wood-fired 90s at 450°C",
  ingredients: [
    { ingredientId: "ing-flour-00",      quantity: 0.250,  wasteFactor: 1.02 }, // 250g flour, 2% waste
    { ingredientId: "ing-san-marzano",   quantity: 0.200,  wasteFactor: 1.0  }, // 1/5 can
    { ingredientId: "ing-fior-di-latte", quantity: 0.125,  wasteFactor: 1.05 }, // 125g, 5% trim waste
    { ingredientId: "ing-fresh-basil",   quantity: 0.100,  wasteFactor: 1.10 }, // 1/10 bunch, 10% wilting
    { ingredientId: "ing-evoo",          quantity: 0.020,  wasteFactor: 1.0  }, // 20ml total (dough + drizzle)
    { ingredientId: "ing-sea-salt",      quantity: 0.005,  wasteFactor: 1.0  }, // 5g
    { ingredientId: "ing-dry-yeast",     quantity: 0.002,  wasteFactor: 1.0  }, // 2g
    { ingredientId: "ing-sugar",         quantity: 0.003,  wasteFactor: 1.0  }, // 3g
  ],
};

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Save ingredients (upsert)
    for (const ing of SEED_INGREDIENTS) {
      await saveIngredient(ing);
    }

    // Save Margherita recipe
    const recipe: Recipe = {
      id: "rcp-margherita-krk",
      ...MARGHERITA_RECIPE,
    };
    await saveRecipe(recipe);

    // Calculate cost for verification
    let totalCost = 0;
    const breakdown: { name: string; qty: string; cost: string }[] = [];
    const ingMap = new Map(SEED_INGREDIENTS.map((i) => [i.id, i]));
    for (const ri of MARGHERITA_RECIPE.ingredients) {
      const ing = ingMap.get(ri.ingredientId);
      if (!ing) continue;
      const lineCost = ing.costPerUnit * ri.quantity * ri.wasteFactor;
      totalCost += lineCost;
      breakdown.push({
        name: ing.name,
        qty: `${ri.quantity} ${ing.unit}`,
        cost: `${(lineCost / 100).toFixed(2)} PLN`,
      });
    }

    return NextResponse.json({
      success: true,
      ingredientsSeeded: SEED_INGREDIENTS.length,
      recipe: {
        id: recipe.id,
        menuItem: "Margherita (Kraków)",
        totalFoodCost: `${(totalCost / 100).toFixed(2)} PLN`,
        sellingPrice: "28.00 PLN",
        margin: `${Math.round(((2800 - totalCost) / 2800) * 100)}%`,
        breakdown,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Seed failed", details: String(err) }, { status: 500 });
  }
}
