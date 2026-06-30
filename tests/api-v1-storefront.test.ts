import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UpsellRequestSchema,
  UpsellSuggestionSchema,
  PublicSettingsSchema,
  ComboDealSchema,
} from "@/lib/api/v1/schemas";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";
import { DEFAULT_LOYALTY_SETTINGS } from "@/lib/store";

// Run with:  npx tsx --test tests/api-v1-storefront.test.ts
//
// The customer storefront facade (`GET /settings/public`, `POST /upsell`) is the
// seam the native customer app decodes — these lock its request validation and
// the response shapes against the live store/upsell sources they map from.

test("UpsellRequestSchema validates + rejects", () => {
  assert.equal(UpsellRequestSchema.safeParse({ locationSlug: "krakow", itemIds: ["krk-pizza-margherita"] }).success, true);
  assert.equal(UpsellRequestSchema.safeParse({ locationSlug: "krakow", itemIds: [] }).success, false); // min 1
  assert.equal(UpsellRequestSchema.safeParse({ itemIds: ["x"] }).success, false); // locationSlug required
});

test("UpsellSuggestion accepts a real-shaped suggestion", () => {
  const ok = UpsellSuggestionSchema.safeParse({
    id: "krk-drink-espresso",
    name: "Espresso",
    description: "Single shot",
    price: 700,
    category: "drinks",
    reason: "Never too late",
  });
  assert.equal(ok.success, true);
});

test("DEFAULT_COMBO_DEALS map onto ComboDealSchema (mapper drift guard)", () => {
  for (const c of DEFAULT_COMBO_DEALS) {
    const dto = {
      id: c.id,
      name: c.name,
      description: c.description,
      categories: c.categories,
      discountPercent: c.discountPercent,
      minItems: c.minItems,
      requiredItems: (c.requiredItems ?? []).map((r) => ({ suffix: r.suffix, label: r.label })),
    };
    assert.equal(ComboDealSchema.safeParse(dto).success, true, `combo ${c.id} failed schema`);
  }
});

test("PublicSettings maps from the live loyalty/store defaults", () => {
  const s = DEFAULT_LOYALTY_SETTINGS;
  const dto = {
    loyalty: {
      pointsPerCurrencyUnit: 1,
      tiers: s.tiers,
      rewards: s.rewards.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost, description: r.description })),
      referral: s.referral.active ? { referrerPoints: s.referral.referrerPoints, refereeDiscountGrosze: s.referral.refereeDiscountGrosze } : null,
    },
    combos: DEFAULT_COMBO_DEALS.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      categories: c.categories,
      discountPercent: c.discountPercent,
      minItems: c.minItems,
      requiredItems: (c.requiredItems ?? []).map((r) => ({ suffix: r.suffix, label: r.label })),
    })),
    speedGuarantee: { active: s.speedGuarantee.active, maxMinutes: s.speedGuarantee.maxMinutes, guaranteeText: s.speedGuarantee.guaranteeText },
    delivery: { fee: 700, freeThresholdGrosze: 6000 },
    minOrderGrosze: 3000,
    tipPresets: [0.1, 0.15, 0.2],
  };
  const parsed = PublicSettingsSchema.safeParse(dto);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error?.issues));
});
