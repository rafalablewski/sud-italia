import { NextRequest, NextResponse } from "next/server";
import { getLocation } from "@/data/locations";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Server-side address autocomplete proxy (Appendix A — "Address autocomplete").
 *
 * Keeps any provider API key on the server (never shipped to the client) and
 * avoids loading a third-party script in the browser, which the CSP forbids.
 *
 * Provider selection:
 *   - Google Places Autocomplete when ADDRESS_AUTOCOMPLETE_GOOGLE_KEY (or
 *     GOOGLE_MAPS_API_KEY) is set — best quality.
 *   - Otherwise OpenStreetMap Nominatim — free, no key, works out of the box.
 *     Biased to Poland and the delivery location's city.
 *
 * Returns: { provider, suggestions: [{ description }] }.
 */
const PL = "pl";

export async function GET(req: NextRequest) {
  // Cheap abuse guard — keystroke-driven, so allow a healthy burst per IP.
  const limited = await enforceRateLimit({
    key: "address-autocomplete",
    id: getClientIp(req),
    limit: 60,
    windowSec: 60,
  });
  if (limited) return limited;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const locationSlug = req.nextUrl.searchParams.get("location") || undefined;
  if (q.length < 3) {
    return NextResponse.json({ provider: "none", suggestions: [] });
  }
  const city = locationSlug ? getLocation(locationSlug)?.city : undefined;

  try {
    const googleKey =
      process.env.ADDRESS_AUTOCOMPLETE_GOOGLE_KEY || process.env.GOOGLE_MAPS_API_KEY;
    const suggestions = googleKey
      ? await googleAutocomplete(q, googleKey)
      : await nominatimAutocomplete(q, city);
    return NextResponse.json({
      provider: googleKey ? "google" : "nominatim",
      suggestions,
    });
  } catch (err) {
    // Autocomplete is a convenience — never block the order on it. Degrade to
    // an empty list (the field stays free-text) and log for visibility.
    logger.warn("address-autocomplete failed", { layer: "api.address", q }, err);
    return NextResponse.json({ provider: "error", suggestions: [] });
  }
}

async function googleAutocomplete(input: string, key: string): Promise<{ description: string }[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("key", key);
  url.searchParams.set("components", `country:${PL}`);
  url.searchParams.set("language", PL);
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = (await res.json()) as { predictions?: { description: string }[] };
  return (data.predictions ?? []).slice(0, 6).map((p) => ({ description: p.description }));
}

async function nominatimAutocomplete(
  input: string,
  city?: string,
): Promise<{ description: string }[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  // Append the city as a soft bias so "ul. Floriańska" resolves locally.
  url.searchParams.set("q", city ? `${input}, ${city}` : input);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("countrycodes", PL);
  url.searchParams.set("limit", "6");
  const res = await fetch(url, {
    signal: AbortSignal.timeout(4000),
    headers: {
      // Nominatim's usage policy requires an identifying User-Agent.
      "User-Agent": "sud-italia-ordering/1.0 (delivery address autocomplete)",
      "Accept-Language": PL,
    },
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = (await res.json()) as { display_name?: string }[];
  return data
    .filter((d) => d.display_name)
    .slice(0, 6)
    .map((d) => ({ description: d.display_name as string }));
}
