import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getGuestSeatingProfile } from "@/lib/store";

/**
 * Guest seating profile — turns a returning guest (looked up by phone) into the
 * TablePrefs the Seating Intelligence Engine's `guest` signal reads: their usual
 * table, preferred zone, and VIP standing (a regular by spend / visits / loyalty).
 * Best-effort: an unknown phone returns empty prefs and the engine stays neutral
 * (Rule #1 — real history only). Manager+, location-scoped.
 *
 * GET /api/admin/floor/guest-prefs?location=&phone=
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const phone = req.nextUrl.searchParams.get("phone") || "";
    if (!phone.trim()) return NextResponse.json({ prefs: {}, name: null, vip: false, visits: 0, usualTableId: null, usualTableLabel: null });
    return NextResponse.json(await getGuestSeatingProfile(locationSlug, phone));
  },
);
