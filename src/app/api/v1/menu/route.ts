import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/menu?location=<slug>` — the customer-facing menu for one site.
 *
 * Public (no auth). Returns customer-relevant fields only — prices stay in
 * **grosze (minor units)**; the native app formats to PLN via `MoneyText`
 * (DESIGN-SYSTEM §4.2), so currency formatting lives in exactly one place per
 * client. Operator-internal fields (cost, packagingCost, sku) are never exposed.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("location")?.trim().toLowerCase();
  if (!slug) {
    return apiError("bad_request", "Query param `location` is required");
  }

  const active = await getActiveLocationsAsync();
  const location = active.find((l) => l.slug === slug);
  if (!location) {
    return apiError("not_found", `No active location "${slug}"`);
  }

  const items = await getMenuWithOverrides(slug);
  return apiOk(
    items.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      price: m.price, // grosze (minor units)
      currency: location.currency,
      category: m.category,
      image: m.image ?? null,
      tags: m.tags,
      available: m.available,
      menuRole: m.menuRole ?? null,
      allergens: m.allergens ?? [],
      nutrition: m.nutrition ?? null,
      prepTimeMinutes: m.prepTimeMinutes ?? null,
      isLimited: m.isLimited ?? false,
      deliveryOnly: m.deliveryOnly ?? false,
      modifierGroups: m.modifierGroups ?? [],
      disclosures: {
        halalStatus: m.halalStatus ?? null,
        nutriGrade: m.nutriGrade ?? null,
        containsPork: m.containsPork ?? false,
        containsAlcohol: m.containsAlcohol ?? false,
      },
    })),
    { location: location.slug, count: items.length },
  );
}
