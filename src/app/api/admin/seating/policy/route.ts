import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSeatingPolicy, saveSeatingPolicy } from "@/lib/store";
import { POLICY_PRESETS, type PolicyPreset, type SeatingWeights, type StoredSeatingPolicy } from "@/lib/seating";

/**
 * Seating Intelligence Engine policy — the manager-tunable weight/rule set the
 * engine scores with (src/lib/seating.ts). Per location: a preset baseline plus
 * optional overrides. Manager+, location-scoped. GET returns the resolved policy
 * + the stored choice; PUT persists a new preset and/or overrides (Rule #7:
 * saves immediately, no separate Save step).
 */

const PRESETS = Object.keys(POLICY_PRESETS) as PolicyPreset[];

export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    return NextResponse.json(await getSeatingPolicy(locationSlug));
  },
);

export const PUT = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const patch: Partial<StoredSeatingPolicy> = {};
    if (body.preset !== undefined) {
      if (!PRESETS.includes(body.preset)) return NextResponse.json({ error: "Unknown preset" }, { status: 400 });
      patch.preset = body.preset;
    }
    if (body.overrides !== undefined) {
      const o = body.overrides;
      if (o === null) {
        patch.overrides = undefined; // clear back to the preset
      } else if (typeof o === "object") {
        const clean: NonNullable<StoredSeatingPolicy["overrides"]> = {};
        if (o.weights && typeof o.weights === "object") {
          const w: Partial<SeatingWeights> = {};
          for (const k of ["fit", "runway", "guest", "pacing", "yield", "section"] as const) {
            if (Number.isFinite(Number(o.weights[k]))) w[k] = Math.max(0, Number(o.weights[k]));
          }
          if (Object.keys(w).length) clean.weights = w;
        }
        if (Number.isFinite(Number(o.resetBufferMin))) clean.resetBufferMin = Math.max(0, Math.min(60, Math.round(Number(o.resetBufferMin))));
        if (Number.isFinite(Number(o.paceCapPer15))) clean.paceCapPer15 = Math.max(1, Math.min(20, Math.round(Number(o.paceCapPer15))));
        if (Number.isFinite(Number(o.largeTableSeats))) clean.largeTableSeats = Math.max(3, Math.min(20, Math.round(Number(o.largeTableSeats))));
        // advanced rules/toggles (increment 3) — 0 disables the section cap
        if (Number.isFinite(Number(o.sectionCapPer15))) clean.sectionCapPer15 = Math.max(0, Math.min(20, Math.round(Number(o.sectionCapPer15))));
        if (typeof o.protectLargeTables === "boolean") clean.protectLargeTables = o.protectLargeTables;
        if (Array.isArray(o.vipHoldZones)) clean.vipHoldZones = o.vipHoldZones.filter((z: unknown) => typeof z === "string" && z.trim()).map((z: string) => z.trim()).slice(0, 12);
        if (typeof o.autoSuggest === "boolean") clean.autoSuggest = o.autoSuggest;
        if (typeof o.learnFromOverrides === "boolean") clean.learnFromOverrides = o.learnFromOverrides;
        if (typeof o.shadowMode === "boolean") clean.shadowMode = o.shadowMode;
        if (Number.isFinite(Number(o.protectLargeReleaseMin))) clean.protectLargeReleaseMin = Math.max(0, Math.min(120, Math.round(Number(o.protectLargeReleaseMin))));
        if (Number.isFinite(Number(o.reservedGraceMin))) clean.reservedGraceMin = Math.max(0, Math.min(60, Math.round(Number(o.reservedGraceMin))));
        patch.overrides = clean;
      } else {
        return NextResponse.json({ error: "Invalid overrides" }, { status: 400 });
      }
    }

    await saveSeatingPolicy(locationSlug, patch);
    return NextResponse.json(await getSeatingPolicy(locationSlug));
  },
);
