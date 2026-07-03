import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { recordSeatingDecision, getSeatingDecisionSummary } from "@/lib/store";
import { OVERRIDE_REASONS, type OverrideReason, type SeatingWeights } from "@/lib/seating";

const SIGNALS: (keyof SeatingWeights)[] = ["fit", "runway", "guest", "pacing", "yield", "section"];

/**
 * Seating decisions — the trust loop behind learn-from-overrides and shadow
 * mode. Every seat logs what the engine recommended vs. what the operator chose
 * (src/lib/seating.ts, SeatingDecision), so the override rate is a real measured
 * number, not a guess. GET returns the rolled-up summary; POST records one
 * decision. Staff+ (seating is a service-floor act), location-scoped.
 *
 * GET/POST /api/admin/seating/decisions?location=
 */

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    return NextResponse.json(await getSeatingDecisionSummary(locationSlug));
  },
);

export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const chosenTableId = String(body.chosenTableId ?? "").trim();
    if (!chosenTableId) return NextResponse.json({ error: "chosenTableId required" }, { status: 400 });

    const decision = await recordSeatingDecision(locationSlug, {
      party: Math.max(1, Math.round(Number(body.party) || 1)),
      atMin: Math.max(0, Math.round(Number(body.atMin) || 0)),
      recommendedTableId: body.recommendedTableId ? String(body.recommendedTableId) : null,
      chosenTableId,
      override: Boolean(body.override),
      shadow: Boolean(body.shadow),
      reason: OVERRIDE_REASONS.includes(body.reason) ? (body.reason as OverrideReason) : undefined,
      topSignal: SIGNALS.includes(body.topSignal) ? (body.topSignal as keyof SeatingWeights) : undefined,
    });
    return NextResponse.json({ decision });
  },
);
