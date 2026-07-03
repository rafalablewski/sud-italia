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
          for (const k of ["fit", "runway", "guest", "pacing", "yield"] as const) {
            if (Number.isFinite(Number(o.weights[k]))) w[k] = Math.max(0, Number(o.weights[k]));
          }
          if (Object.keys(w).length) clean.weights = w;
        }
        if (Number.isFinite(Number(o.resetBufferMin))) clean.resetBufferMin = Math.max(0, Math.min(60, Math.round(Number(o.resetBufferMin))));
        if (Number.isFinite(Number(o.paceCapPer15))) clean.paceCapPer15 = Math.max(1, Math.min(20, Math.round(Number(o.paceCapPer15))));
        if (Number.isFinite(Number(o.largeTableSeats))) clean.largeTableSeats = Math.max(3, Math.min(20, Math.round(Number(o.largeTableSeats))));
        patch.overrides = clean;
      } else {
        return NextResponse.json({ error: "Invalid overrides" }, { status: 400 });
      }
    }

    await saveSeatingPolicy(locationSlug, patch);
    return NextResponse.json(await getSeatingPolicy(locationSlug));
  },
);
