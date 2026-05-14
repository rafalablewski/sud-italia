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

    // Optional bundles[] (audit §3.2). Validate shape so a typo doesn't
    // poison the cart-drawer ladder. Composition slots are checked too
    // since they drive cart line resolution at checkout.
    if (config.bundles !== undefined) {
      if (!Array.isArray(config.bundles)) {
        return NextResponse.json(
          { error: "Invalid config: bundles must be an array" },
          { status: 400 },
        );
      }
      const validMealPeriods = new Set(["lunch", "family"]);
      for (const b of config.bundles) {
        if (
          typeof b?.id !== "string" ||
          typeof b?.tier !== "string" ||
          typeof b?.name !== "string" ||
          typeof b?.description !== "string" ||
          typeof b?.priceGrosze !== "number" ||
          b.priceGrosze < 0 ||
          typeof b?.refPriceGrosze !== "number" ||
          b.refPriceGrosze < 0 ||
          typeof b?.mealPeriod !== "string" ||
          !validMealPeriods.has(b.mealPeriod) ||
          typeof b?.active !== "boolean" ||
          !Array.isArray(b?.composition) ||
          b.composition.length === 0
        ) {
          return NextResponse.json(
            { error: "Invalid bundle — check id, name, prices, mealPeriod, composition" },
            { status: 400 },
          );
        }
        for (const slot of b.composition) {
          if (
            (slot?.kind !== "category" && slot?.kind !== "item") ||
            typeof slot?.quantity !== "number" ||
            slot.quantity < 1 ||
            slot.quantity > 20
          ) {
            return NextResponse.json(
              { error: "Invalid bundle slot — kind must be 'category' or 'item'; quantity 1–20" },
              { status: 400 },
            );
          }
        }
      }
    }

    // Optional bundleRules (audit §3.2 follow-up).
    if (config.bundleRules !== undefined) {
      const r = config.bundleRules;
      if (r?.lunch) {
        if (
          typeof r.lunch.startHour !== "number" ||
          typeof r.lunch.endHour !== "number" ||
          r.lunch.startHour < 0 ||
          r.lunch.endHour > 24 ||
          r.lunch.endHour <= r.lunch.startHour
        ) {
          return NextResponse.json(
            { error: "Invalid bundleRules.lunch — startHour/endHour out of range" },
            { status: 400 },
          );
        }
      }
      if (r?.family) {
        if (
          typeof r.family.minMainItems !== "number" ||
          r.family.minMainItems < 2 ||
          typeof r.family.hintWithin !== "number" ||
          r.family.hintWithin < 0
        ) {
          return NextResponse.json(
            { error: "Invalid bundleRules.family — minMainItems ≥ 2; hintWithin ≥ 0" },
            { status: 400 },
          );
        }
      }
    }

    const settings = await updateLocationUpsell(locationSlug, config);
    return NextResponse.json(settings);
  },
);
