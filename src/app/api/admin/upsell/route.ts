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

    // Optional timeWindows[] (audit §2.3). Validate shape so a typo
    // doesn't poison the customer-facing TodBanner.
    if (config.timeWindows !== undefined) {
      if (!Array.isArray(config.timeWindows)) {
        return NextResponse.json(
          { error: "Invalid config: timeWindows must be an array" },
          { status: 400 },
        );
      }
      const validVariants = new Set(["morning", "lunch", "afternoon", "dinner", "late"]);
      for (const w of config.timeWindows) {
        if (
          typeof w?.id !== "string" ||
          typeof w?.variant !== "string" ||
          !validVariants.has(w.variant) ||
          typeof w?.startHour !== "number" ||
          typeof w?.endHour !== "number" ||
          w.startHour < 0 ||
          w.startHour > 23 ||
          w.endHour < 0 ||
          w.endHour > 24 ||
          w.endHour <= w.startHour ||
          typeof w?.title !== "string" ||
          typeof w?.sub !== "string" ||
          typeof w?.badge !== "string" ||
          typeof w?.cta !== "string" ||
          typeof w?.active !== "boolean"
        ) {
          return NextResponse.json(
            { error: "Invalid time window — check variant, hour bounds, and required text fields" },
            { status: 400 },
          );
        }
      }
    }

    const settings = await updateLocationUpsell(locationSlug, config);
    return NextResponse.json(settings);
  },
);
