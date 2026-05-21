import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { saveIngredient, saveIngredientProduct, saveRecipe } from "@/lib/store";
import type { Ingredient, IngredientCategory, IngredientUnit, Recipe } from "@/data/types";
import { getMenu } from "@/data/menus";

// Seed data: ingredients + default distributor offerings with avg Polish
// market prices (2026). Each row spawns one IngredientProduct keyed to a
// "legacy:<supplier name>" id so existing data renders sensibly until
// the operator wires a real Supplier row.
interface SeedIngredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  costPerUnit: number;
  supplier: string;
  notes?: string;
}

const SEED_INGREDIENTS: SeedIngredient[] = [
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

// Seeding ingredients + recipes is a chain-level operation; owner only.
export const POST = withAdmin({ roles: ["owner"] }, async () => {
  try {
    // Save ingredients (identity-only) + default offering (cost +
    // legacy supplier name). Pointing activeProductId at the new
    // offering means recipe cost picks up the seed cost immediately.
    for (const seed of SEED_INGREDIENTS) {
      const product = await saveIngredientProduct({
        ingredientId: seed.id,
        supplierId: seed.supplier ? `legacy:${seed.supplier}` : "legacy:unknown",
        displayName: "Default offering",
        costPerUnit: seed.costPerUnit,
      });
      const ingredient: Ingredient = {
        id: seed.id,
        name: seed.name,
        category: seed.category,
        unit: seed.unit,
        activeProductId: product.id,
        notes: seed.notes,
      };
      await saveIngredient(ingredient);
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

    // Pull the canonical menu item so the seed verification never drifts
    // from src/data/menus/krakow.ts when prices change.
    const seedItem = getMenu("krakow").find((m) => m.id === MARGHERITA_RECIPE.menuItemId);
    const sellingPriceGrosze = seedItem?.price ?? 0;
    const menuItemLabel = seedItem ? `${seedItem.name} (Kraków)` : "Margherita (Kraków)";

    return NextResponse.json({
      success: true,
      ingredientsSeeded: SEED_INGREDIENTS.length,
      recipe: {
        id: recipe.id,
        menuItem: menuItemLabel,
        totalFoodCost: `${(totalCost / 100).toFixed(2)} PLN`,
        sellingPrice: `${(sellingPriceGrosze / 100).toFixed(2)} PLN`,
        margin:
          sellingPriceGrosze > 0
            ? `${Math.round(((sellingPriceGrosze - totalCost) / sellingPriceGrosze) * 100)}%`
            : "n/a",
        breakdown,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Seed failed", details: String(err) }, { status: 500 });
  }
});
