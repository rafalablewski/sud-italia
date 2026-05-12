import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { getUpsellSettings, updateLocationUpsell } from "@/lib/store";
import { locations } from "@/data/locations";

const validSlugs = new Set(locations.map((l) => l.slug));

export const GET = withAdmin({}, async () => {
  const settings = await getUpsellSettings();
  return NextResponse.json(settings);
});

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const body = await req.json();
    const { locationSlug, config } = body;

    if (!locationSlug || !config) {
      return NextResponse.json({ error: "Missing locationSlug or config" }, { status: 400 });
    }

    if (!validSlugs.has(locationSlug)) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    if (!(await hasLocationAccess(locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${locationSlug}"` },
        { status: 403 },
      );
    }

    if (!Array.isArray(config.combos)) {
      return NextResponse.json({ error: "Invalid config: combos must be an array" }, { status: 400 });
    }

    const settings = await updateLocationUpsell(locationSlug, config);
    return NextResponse.json(settings);
  },
);
