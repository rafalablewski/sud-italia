import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders, getUpsellSettings, getMLUpsellModel } from "@/lib/store";
import { compareUpsellArms } from "@/lib/ml-upsell-rollout";

/**
 * ML-vs-rules attach-rate comparison for one location (audit elite-qsr §1).
 *
 * Recomputes each order's arm from its phone (the same deterministic
 * bucket the serving path uses) and compares attach rate + AOV between
 * the ML and rules arms with the significance engine. The window is
 * clamped to the model's trainedAt so ML-arm orders genuinely saw the ML
 * ranker (it falls back to rules before a model exists).
 *
 * manager/owner; per-location. Assumes the rollout % has been stable over
 * the window (the UI states this) — there's no per-order assignment log,
 * by design, since the bucket is reproducible.
 */
export const GET = withAdmin(
  { roles: ["manager", "owner"], locationParam: "location" },
  async (req) => {
    const url = new URL(req.url);
    const locationSlug = url.searchParams.get("location");
    if (!locationSlug) {
      return NextResponse.json({ error: "location_required" }, { status: 400 });
    }
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));

    const settings = await getUpsellSettings();
    const rolloutPct = Math.max(0, Math.min(100, settings[locationSlug]?.mlUpsellRolloutPct ?? 0));
    const model = await getMLUpsellModel(locationSlug);

    if (!model) {
      return NextResponse.json({ ready: false, reason: "no_model", rolloutPct });
    }
    if (rolloutPct <= 0) {
      return NextResponse.json({ ready: false, reason: "rollout_off", rolloutPct });
    }

    // Clamp the window to the later of {requested window, model trained-at}
    // so ML-arm orders before the model existed (served rules) are excluded.
    const requestedSince = Date.now() - days * 24 * 60 * 60 * 1000;
    const trainedAtMs = Date.parse(model.trainedAt);
    const sinceIso = new Date(
      Number.isFinite(trainedAtMs) ? Math.max(requestedSince, trainedAtMs) : requestedSince,
    ).toISOString();

    const orders = await getOrders(locationSlug, sinceIso);
    const comparison = compareUpsellArms(orders, { locationSlug, rolloutPct, windowSinceIso: sinceIso });

    return NextResponse.json({ ready: true, windowDays: days, ...comparison });
  },
);
