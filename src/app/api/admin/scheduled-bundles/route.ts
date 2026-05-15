import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getScheduledBundleIntents } from "@/lib/store";

/**
 * Admin viewer for scheduled-bundle intents (Sprint 4 #17 — Pret weekly
 * usual). Operator-only; lists pending/active intents per location so
 * the operator can manually fulfil this week's runs while Phase 2 wires
 * actual Stripe Subscription rebill.
 */
export const GET = withAdmin({}, async (req) => {
  const url = new URL(req.url);
  const locationSlug = url.searchParams.get("location") || undefined;
  const status = url.searchParams.get("status") as
    | "pending" | "active" | "paused" | "cancelled" | null;
  const intents = await getScheduledBundleIntents({
    locationSlug,
    status: status ?? undefined,
  });
  return NextResponse.json({ intents });
});
