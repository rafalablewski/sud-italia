import { apiOk } from "@/lib/api/v1/envelope";
import { getActiveLocationsAsync } from "@/lib/locations-store";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/locations` — active locations for the customer app's picker.
 *
 * Public (no auth): browsing is zero-friction. Returns a curated DTO — no
 * operator-internal fields. Reads through the existing locations store, so it's
 * Postgres in prod / filesystem in dev with no special-casing.
 */
export async function GET() {
  const locations = await getActiveLocationsAsync();
  return apiOk(
    locations
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((l) => ({
        slug: l.slug,
        name: l.name,
        city: l.city,
        address: l.address,
        coordinates: l.coordinates,
        heroImage: l.heroImage,
        shortDescription: l.shortDescription,
        hours: l.hours,
        currency: l.currency,
        servesAlcohol: l.servesAlcohol ?? false,
        teamLead: l.teamLead ?? null,
      })),
  );
}
