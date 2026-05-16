import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

/**
 * Weather-aware staffing tips (m5_7). Pulls a free Open-Meteo
 * 24h forecast per location and emits a structured recommendation
 * (no SMS yet — that's an outbox concern; this cron is just the
 * signal generator).
 *
 * Logic v1:
 *   - max-temp + precipitation prob → expected demand factor
 *   - bad weather (rain ≥ 60%, snow forecast, gusts > 60 km/h):
 *     suggest staff-down +1 closing shift early
 *   - sunny + ≥ 18°C + Friday/Saturday: suggest staff-up
 *
 * Stored in cron log + Sentry; managers will eventually see this as
 * a card on /admin/dashboard. Phase 5 keeps it lightweight.
 *
 * Coordinates come from the locations table (m4_1) — every new truck
 * ships with lat/lng on creation, so the cron picks it up without a
 * code change.
 */

interface ForecastTip {
  locationSlug: string;
  forecast: {
    maxTempC: number;
    minTempC: number;
    precipProbMaxPct: number;
    windMaxKph: number;
  } | null;
  recommendation: "staff_up" | "staff_down" | "as_planned";
  rationale: string;
}

async function fetchForecast(lat: number, lng: number): Promise<ForecastTip["forecast"]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        wind_speed_10m_max?: number[];
      };
    };
    const d = json.daily;
    if (!d?.temperature_2m_max?.length) return null;
    return {
      maxTempC: d.temperature_2m_max[0],
      minTempC: d.temperature_2m_min?.[0] ?? 0,
      precipProbMaxPct: d.precipitation_probability_max?.[0] ?? 0,
      windMaxKph: d.wind_speed_10m_max?.[0] ?? 0,
    };
  } catch (err) {
    logger.error("weather-staffing.fetch_failed", { lat, lng }, err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const locations = await getActiveLocationsAsync();
  const tips: ForecastTip[] = [];
  const now = new Date();
  const dow = now.getUTCDay(); // 5=Fri, 6=Sat

  for (const loc of locations) {
    const coords = loc.coordinates;
    if (!coords || (coords.lat === 0 && coords.lng === 0)) {
      tips.push({
        locationSlug: loc.slug,
        forecast: null,
        recommendation: "as_planned",
        rationale: "No coordinates configured for this location.",
      });
      continue;
    }
    const forecast = await fetchForecast(coords.lat, coords.lng);
    if (!forecast) {
      tips.push({
        locationSlug: loc.slug,
        forecast: null,
        recommendation: "as_planned",
        rationale: "Weather API unavailable; defaulting to as-planned staffing.",
      });
      continue;
    }
    const bad =
      forecast.precipProbMaxPct >= 60 ||
      forecast.windMaxKph >= 60 ||
      forecast.maxTempC <= 2;
    const great =
      forecast.maxTempC >= 18 &&
      forecast.precipProbMaxPct < 30 &&
      (dow === 5 || dow === 6);
    const recommendation: ForecastTip["recommendation"] = bad
      ? "staff_down"
      : great
        ? "staff_up"
        : "as_planned";
    const rationale = bad
      ? `Precip ${forecast.precipProbMaxPct}%, wind ${Math.round(forecast.windMaxKph)} km/h, low ${forecast.minTempC}°C — drop walk-ins likely; suggest cutting one closing shift.`
      : great
        ? `Weekend warm-dry forecast (high ${forecast.maxTempC}°C). Bump kitchen and front by one each.`
        : `Conditions look neutral. Run the scheduled headcount.`;
    tips.push({ locationSlug: loc.slug, forecast, recommendation, rationale });
  }

  logCronRun("weather-staffing", { tips });
  return NextResponse.json({ ok: true, tips });
}
