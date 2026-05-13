import { NextRequest, NextResponse } from "next/server";
import { getTruckEvents } from "@/lib/store";
import {
  GEOFENCE_RADIUS_METERS,
  distanceMeters,
  readFix,
} from "@/lib/truck-live-location";

/**
 * Public live-truck readout (m5_4 + m5_5). Returns every truck event
 * currently in status='live' with its most recent fix (if any) and,
 * when the caller supplies lat/lng, a `nearby` flag computed against
 * GEOFENCE_RADIUS_METERS.
 *
 * Read-only, no auth — runs on the marketing site so customers
 * walking past the truck see the "you're nearby, order now" CTA.
 * Customer lat/lng is consumed once and discarded (not persisted).
 */
export async function GET(req: NextRequest) {
  const today = new Date().toISOString().slice(0, 10);
  const lat = Number.parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = Number.parseFloat(req.nextUrl.searchParams.get("lng") ?? "");
  const hasCustomerLoc =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const events = await getTruckEvents({ from: today });
  const live = events.filter((e) => e.status === "live");
  const results = await Promise.all(
    live.map(async (event) => {
      const fix = await readFix(event.id);
      const distance =
        hasCustomerLoc && fix
          ? Math.round(distanceMeters({ lat, lng }, { lat: fix.lat, lng: fix.lng }))
          : null;
      return {
        eventId: event.id,
        name: event.name,
        locationSlug: event.locationSlug,
        fix,
        distanceMeters: distance,
        nearby: distance !== null && distance <= GEOFENCE_RADIUS_METERS,
      };
    }),
  );
  return NextResponse.json({ liveEvents: results, geofenceMeters: GEOFENCE_RADIUS_METERS });
}
