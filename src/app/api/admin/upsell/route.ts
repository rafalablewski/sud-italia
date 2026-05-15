import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { getUpsellSettings, updateLocationUpsell } from "@/lib/store";
import { locations } from "@/data/locations";
import type { MenuCategory } from "@/data/types";

const validSlugs = new Set(locations.map((l) => l.slug));

const validMenuCategories = new Set<MenuCategory>([
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
]);

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

    // Validate each combo shape so a typo'd category doesn't silently
    // disable the deal at checkout — bundles get the same treatment below.
    for (const c of config.combos) {
      if (
        typeof c?.id !== "string" ||
        c.id.trim().length === 0 ||
        typeof c?.name !== "string" ||
        c.name.trim().length === 0 ||
        typeof c?.description !== "string" ||
        !Array.isArray(c?.categories) ||
        c.categories.length === 0 ||
        typeof c?.discountPercent !== "number" ||
        c.discountPercent < 1 ||
        c.discountPercent > 50 ||
        typeof c?.minItems !== "number" ||
        !Number.isInteger(c.minItems) ||
        c.minItems < 1 ||
        c.minItems > 20 ||
        typeof c?.active !== "boolean"
      ) {
        return NextResponse.json(
          { error: "Invalid combo — check id, name, categories, discountPercent (1–50), minItems (1–20), active" },
          { status: 400 },
        );
      }
      for (const cat of c.categories) {
        if (typeof cat !== "string" || !validMenuCategories.has(cat as MenuCategory)) {
          return NextResponse.json(
            { error: `Invalid combo category "${cat}" — must be one of pizza, pasta, antipasti, panini, drinks, desserts` },
            { status: 400 },
          );
        }
      }
      // Duplicate categories would otherwise double-count the same item's
      // price in getActiveComboDeals' savings reduce. Reject at the edge
      // so the data layer can stay defensive but not paranoid.
      if (new Set(c.categories).size !== c.categories.length) {
        return NextResponse.json(
          { error: "Invalid combo — categories must be unique" },
          { status: 400 },
        );
      }
      // Optional requiredItems[] — item-suffix gating (Italian Classic Deal
      // style). When present, the combo only activates if the cart contains
      // an item matching each suffix.
      if (c.requiredItems !== undefined) {
        if (!Array.isArray(c.requiredItems) || c.requiredItems.length === 0) {
          return NextResponse.json(
            { error: "Invalid combo requiredItems — must be a non-empty array when set" },
            { status: 400 },
          );
        }
        const seenSuffixes = new Set<string>();
        for (const r of c.requiredItems) {
          if (
            typeof r?.suffix !== "string" ||
            r.suffix.trim().length === 0 ||
            typeof r?.label !== "string" ||
            r.label.trim().length === 0
          ) {
            return NextResponse.json(
              { error: "Invalid combo requiredItem — both suffix and label must be non-empty strings" },
              { status: 400 },
            );
          }
          if (seenSuffixes.has(r.suffix)) {
            return NextResponse.json(
              { error: `Invalid combo — requiredItems suffix "${r.suffix}" appears more than once` },
              { status: 400 },
            );
          }
          seenSuffixes.add(r.suffix);
        }
      }
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
          typeof b?.mealPeriod !== "string" ||
          !validMealPeriods.has(b.mealPeriod) ||
          typeof b?.active !== "boolean" ||
          !Array.isArray(b?.composition) ||
          b.composition.length === 0
        ) {
          return NextResponse.json(
            { error: "Invalid bundle — check id, name, mealPeriod, composition" },
            { status: 400 },
          );
        }
        // Pricing mode — "fixed" (default when absent for back-compat) or "dynamic".
        const pricingMode = b.pricingMode ?? "fixed";
        if (pricingMode !== "fixed" && pricingMode !== "dynamic") {
          return NextResponse.json(
            { error: "Invalid bundle pricingMode — must be 'fixed' or 'dynamic'" },
            { status: 400 },
          );
        }
        if (pricingMode === "fixed") {
          if (
            typeof b?.priceGrosze !== "number" ||
            b.priceGrosze < 0 ||
            typeof b?.refPriceGrosze !== "number" ||
            b.refPriceGrosze < 0
          ) {
            return NextResponse.json(
              { error: "Invalid fixed bundle — priceGrosze and refPriceGrosze must be non-negative numbers" },
              { status: 400 },
            );
          }
          if (b.refPriceGrosze < b.priceGrosze) {
            return NextResponse.json(
              { error: "Invalid bundle — refPriceGrosze must be ≥ priceGrosze (no negative savings)" },
              { status: 400 },
            );
          }
        } else {
          // Dynamic — mainCategories non-empty subset of MenuCategory,
          // minMains ≥ 1, optional maxMains ≥ minMains, discount 0–50,
          // composition must not contain a main category.
          if (
            !Array.isArray(b?.mainCategories) ||
            b.mainCategories.length === 0
          ) {
            return NextResponse.json(
              { error: "Invalid dynamic bundle — mainCategories must be a non-empty array" },
              { status: 400 },
            );
          }
          const mainsSet = new Set<string>();
          for (const cat of b.mainCategories) {
            if (typeof cat !== "string" || !validMenuCategories.has(cat as MenuCategory)) {
              return NextResponse.json(
                { error: `Invalid dynamic bundle mainCategory "${cat}" — must be a MenuCategory` },
                { status: 400 },
              );
            }
            mainsSet.add(cat);
          }
          if (
            typeof b?.minMains !== "number" ||
            !Number.isInteger(b.minMains) ||
            b.minMains < 1 ||
            b.minMains > 50
          ) {
            return NextResponse.json(
              { error: "Invalid dynamic bundle — minMains must be an integer 1–50" },
              { status: 400 },
            );
          }
          if (b.maxMains !== undefined && b.maxMains !== null) {
            if (
              typeof b.maxMains !== "number" ||
              !Number.isInteger(b.maxMains) ||
              b.maxMains < b.minMains ||
              b.maxMains > 100
            ) {
              return NextResponse.json(
                { error: "Invalid dynamic bundle — maxMains must be an integer ≥ minMains and ≤ 100" },
                { status: 400 },
              );
            }
          }
          if (
            typeof b?.discountPercent !== "number" ||
            b.discountPercent < 0 ||
            b.discountPercent > 50
          ) {
            return NextResponse.json(
              { error: "Invalid dynamic bundle — discountPercent must be 0–50" },
              { status: 400 },
            );
          }
          for (const slot of b.composition) {
            if (slot?.kind === "category" && typeof slot.category === "string" && mainsSet.has(slot.category)) {
              return NextResponse.json(
                { error: `Invalid dynamic bundle — composition slot category "${slot.category}" must not overlap a mainCategory (it would double-count). Use the add-on categories only.` },
                { status: 400 },
              );
            }
          }
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
        // Optional scarcity field (Sprint 6 #4).
        if (b.limitedUntil !== undefined && b.limitedUntil !== null) {
          if (typeof b.limitedUntil !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.limitedUntil)) {
            return NextResponse.json(
              { error: "Invalid bundle.limitedUntil — must be YYYY-MM-DD" },
              { status: 400 },
            );
          }
        }
        // Optional weekday gating (Sprint 6 #9).
        if (b.activeDays !== undefined && b.activeDays !== null) {
          if (!Array.isArray(b.activeDays)) {
            return NextResponse.json(
              { error: "Invalid bundle.activeDays — must be an array of weekday names" },
              { status: 400 },
            );
          }
          const validDays = new Set([
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ]);
          for (const d of b.activeDays) {
            if (typeof d !== "string" || !validDays.has(d)) {
              return NextResponse.json(
                { error: `Invalid bundle.activeDays entry "${d}" — expected lowercase English weekday` },
                { status: 400 },
              );
            }
          }
        }
      }
    }

    // Optional experiment (Sprint 6 #1 — A/B framework).
    if (config.experiment !== undefined && config.experiment !== null) {
      const exp = config.experiment;
      if (
        typeof exp?.id !== "string" ||
        exp.id.trim().length === 0 ||
        typeof exp?.name !== "string" ||
        typeof exp?.active !== "boolean" ||
        !Array.isArray(exp?.variants) ||
        exp.variants.length === 0
      ) {
        return NextResponse.json(
          { error: "Invalid experiment — needs id, name, active, non-empty variants" },
          { status: 400 },
        );
      }
      const seenVariantIds = new Set<string>();
      for (const v of exp.variants) {
        if (
          typeof v?.id !== "string" ||
          v.id.trim().length === 0 ||
          typeof v?.label !== "string" ||
          typeof v?.weight !== "number" ||
          v.weight < 0 ||
          v.weight > 100
        ) {
          return NextResponse.json(
            { error: "Invalid experiment variant — needs id, label, weight 0–100" },
            { status: 400 },
          );
        }
        if (seenVariantIds.has(v.id)) {
          return NextResponse.json(
            { error: `Duplicate experiment variant id "${v.id}"` },
            { status: 400 },
          );
        }
        seenVariantIds.add(v.id);
        if (v.bundleOverrides !== undefined && v.bundleOverrides !== null) {
          if (typeof v.bundleOverrides !== "object") {
            return NextResponse.json(
              { error: "Invalid experiment variant bundleOverrides — must be an object" },
              { status: 400 },
            );
          }
          for (const [bundleId, o] of Object.entries(v.bundleOverrides)) {
            const okNumber = typeof o === "number" && o >= 0 && o <= 50;
            const okObject =
              o !== null &&
              typeof o === "object" &&
              Object.values(o as Record<string, unknown>).every(
                (val) => val === undefined || (typeof val === "number" && val >= 0 && val <= 50),
              );
            if (!okNumber && !okObject) {
              return NextResponse.json(
                { error: `Invalid experiment override for "${bundleId}" — must be a 0–50 number or {discountPercent?, mainsDiscountPercent?, addOnsDiscountPercent?} with 0–50 values` },
                { status: 400 },
              );
            }
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
