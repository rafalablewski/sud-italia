import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getEvents } from "@/lib/store";
import { publishFix, readFix, type LiveLocationFix } from "@/lib/truck-live-location";

/**
 * Truck operator live-location push (m5_5). PWA on the truck POSTs
 * { lat, lng, accuracyMeters?, speedMps? } every 30s while the event
 * is live. Stored in Upstash with a 90s TTL — privacy-by-default,
 * no permanent track log.
 *
 * Manager+ because dispatchers / managers may share-take the truck
 * device during a shift change.
 */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["owner", "manager", "staff"] },
  async (req, { params }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      lat?: number;
      lng?: number;
      accuracyMeters?: number;
      speedMps?: number;
    };
    if (
      typeof body.lat !== "number" ||
      typeof body.lng !== "number" ||
      !Number.isFinite(body.lat) ||
      !Number.isFinite(body.lng) ||
      Math.abs(body.lat) > 90 ||
      Math.abs(body.lng) > 180
    ) {
      return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
    }

    const events = await getEvents();
    const event = events.find((e) => e.id === id);
    if (!event) {
      return NextResponse.json({ error: "Truck event not found" }, { status: 404 });
    }
    if (event.status !== "live") {
      return NextResponse.json(
        { error: `Truck event is ${event.status}, not live — start it first.` },
        { status: 409 },
      );
    }

    const fix: LiveLocationFix = {
      eventId: id,
      lat: body.lat,
      lng: body.lng,
      accuracyMeters:
        typeof body.accuracyMeters === "number" && Number.isFinite(body.accuracyMeters)
          ? body.accuracyMeters
          : undefined,
      speedMps:
        typeof body.speedMps === "number" && Number.isFinite(body.speedMps)
          ? body.speedMps
          : undefined,
      capturedAt: new Date().toISOString(),
    };
    await publishFix(fix);
    return NextResponse.json({ ok: true, fix });
  },
);

export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["owner", "manager", "staff"] },
  async (_req, { params }) => {
    const { id } = await params;
    const fix = await readFix(id);
    return NextResponse.json({ fix });
  },
);
