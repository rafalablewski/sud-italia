import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders, getMLUpsellModels, saveMLUpsellModel } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocations } from "@/data/locations";
import { trainModel, MIN_TRAINING_SAMPLES } from "@/lib/ml-upsell";

/**
 * ML upsell ranker — train + status (audit elite-qsr §1).
 *
 * GET  → current model status per location (trainedAt, sampleCount,
 *        positiveRate, logLoss) so the admin can see what's deployed.
 * POST → (re)train. Body `{ location?, days? }`. Pulls real orders for
 *        the window, builds the leakage-controlled training set, fits the
 *        logistic ranker, and persists per location. Cold-start locations
 *        (< MIN_TRAINING_SAMPLES examples) are skipped and reported, so
 *        inference falls back to the rules ranker for them.
 *
 * manager+; spans all locations, so any-authenticated would leak other
 * trucks' models — gate to owner/manager via roles. Training reads real
 * orders only (getOrders filters simulated by default).
 */

const DEFAULT_WINDOW_DAYS = 180;

export const GET = withAdmin({ roles: ["manager", "owner"] }, async () => {
  const models = await getMLUpsellModels();
  const status = Object.values(models).map((m) => ({
    locationSlug: m.locationSlug,
    trainedAt: m.trainedAt,
    sampleCount: m.sampleCount,
    positiveRate: m.positiveRate,
    logLoss: m.logLoss,
    featureNames: m.featureNames,
  }));
  return NextResponse.json({ models: status });
});

export const POST = withAdmin({ roles: ["manager", "owner"] }, async (req) => {
  const body = await req.json().catch(() => ({}));
  const days = Math.max(7, Math.min(365, Number(body?.days) || DEFAULT_WINDOW_DAYS));
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const onlyLocation: string | undefined =
    typeof body?.location === "string" ? body.location : undefined;

  const locations = getActiveLocations()
    .map((l) => l.slug)
    .filter((slug) => !onlyLocation || slug === onlyLocation);

  const trained: {
    locationSlug: string;
    trained: boolean;
    sampleCount?: number;
    positiveRate?: number;
    logLoss?: number;
    reason?: string;
  }[] = [];

  for (const slug of locations) {
    const [orders, menu] = await Promise.all([
      getOrders(slug, sinceIso),
      getMenuWithOverrides(slug),
    ]);
    const model = trainModel(orders, menu, slug);
    if (!model) {
      trained.push({
        locationSlug: slug,
        trained: false,
        reason: `cold start — fewer than ${MIN_TRAINING_SAMPLES} training examples in the last ${days} days; rules ranker stays in use`,
      });
      continue;
    }
    await saveMLUpsellModel(model);
    trained.push({
      locationSlug: slug,
      trained: true,
      sampleCount: model.sampleCount,
      positiveRate: model.positiveRate,
      logLoss: model.logLoss,
    });
  }

  return NextResponse.json({ windowDays: days, results: trained });
});
