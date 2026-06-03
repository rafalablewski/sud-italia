import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrdersByPhone,
  getMLUpsellModel,
  getUpsellSettings,
} from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { scoreCandidates } from "@/lib/ml-upsell";
import { inMlArm } from "@/lib/ml-upsell-rollout";

/**
 * ML cross-sell ranking for a live cart (audit elite-qsr §1).
 *
 * The model lives server-side (weights + learned aggregates), so the cart
 * asks here for a ranked candidate list. A/B rollout is decided here too:
 * a customer is deterministically phone-bucketed into the ML arm when
 * their bucket falls under the location's `mlUpsellRolloutPct`. The same
 * hash is reproducible from any order's phone, so the ML-vs-rules arms can
 * be compared retroactively without storing assignments.
 *
 * Returns `{ ranker: "ml", variant, itemIds }` for the ML arm with a
 * trained model, else `{ ranker: "rules", variant }` — the cart then uses
 * its existing rules ranker, so this endpoint can never break cross-sell.
 *
 * Public endpoint; rate-limited by shared middleware. Reads only.
 */

const bodySchema = z.object({
  phone: z.string().min(4).max(24),
  locationSlug: z.string().min(1).max(40),
  cartItemIds: z.array(z.string().min(1).max(80)).max(50).default([]),
  hour: z.number().int().min(0).max(23).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ranker: "rules", variant: "control" });
  }
  const { locationSlug, cartItemIds } = parsed.data;
  const phone = normalizePlPhoneE164(parsed.data.phone);
  if (!phone) return NextResponse.json({ ranker: "rules", variant: "control" });

  const settings = await getUpsellSettings();
  const rolloutPct = Math.max(0, Math.min(100, settings[locationSlug]?.mlUpsellRolloutPct ?? 0));
  if (rolloutPct <= 0) {
    return NextResponse.json({ ranker: "rules", variant: "control" });
  }

  if (!inMlArm(phone, locationSlug, rolloutPct)) {
    return NextResponse.json({ ranker: "rules", variant: "control" });
  }

  const model = await getMLUpsellModel(locationSlug);
  if (!model) {
    // ML arm but no trained model yet — fall back to rules (cold start).
    return NextResponse.json({ ranker: "rules", variant: "ml_cold" });
  }

  const [orders, menu] = await Promise.all([
    getOrdersByPhone(phone),
    getMenuWithOverrides(locationSlug),
  ]);

  // Per-customer attach context (same shape as /api/customer/attach-history).
  const attachByItemId: Record<string, number> = {};
  for (const o of orders) {
    const seen = new Set<string>();
    for (const line of o.items) {
      const id = line.menuItem?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      attachByItemId[id] = (attachByItemId[id] ?? 0) + 1;
    }
  }

  const inCart = new Set(cartItemIds);
  const candidates = menu.filter((m) => m.available && !inCart.has(m.id));
  const ranked = scoreCandidates(model, candidates, {
    hour: parsed.data.hour ?? new Date().getHours(),
    customerOrderCount: orders.length,
    customerAttachByItemId: attachByItemId,
  });

  return NextResponse.json({
    ranker: "ml",
    variant: "ml",
    itemIds: ranked.slice(0, 6).map((r) => r.itemId),
  });
}
