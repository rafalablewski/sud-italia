import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getWaFunnelEvents, type WaFunnelStage } from "@/lib/store";

/**
 * WhatsApp conversion funnel over a window. Aggregation is cumulative per
 * phone: each conversation counts toward every stage up to the furthest it
 * reached, so a missed intermediate event never breaks the funnel and drop-off
 * is monotonic. Simulated chats bypass the live pipeline, so they never appear.
 */

const STAGE_ORDER: WaFunnelStage[] = [
  "started",
  "location",
  "cart",
  "fulfillment",
  "slot",
  "payment",
  "paid",
];
const STAGE_LABEL: Record<WaFunnelStage, string> = {
  started: "Conversations started",
  location: "Location chosen",
  cart: "Item added to cart",
  fulfillment: "Takeout / delivery set",
  slot: "Time slot picked",
  payment: "Pay link sent",
  paid: "Order paid",
};
const RANK: Record<WaFunnelStage, number> = STAGE_ORDER.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<WaFunnelStage, number>,
);

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const windowParam = req.nextUrl.searchParams.get("window") ?? "7d";
    const days = windowParam === "30d" ? 30 : windowParam === "all" ? 0 : 7;
    const sinceMs = days > 0 ? Date.now() - days * DAY_MS : undefined;

    const events = await getWaFunnelEvents(sinceMs);

    // Furthest stage rank reached per phone.
    const furthest = new Map<string, number>();
    for (const e of events) {
      const rank = RANK[e.stage];
      if (rank == null) continue;
      const cur = furthest.get(e.phone);
      if (cur == null || rank > cur) furthest.set(e.phone, rank);
    }

    // Cumulative: a phone at rank R counts toward every stage with rank ≤ R.
    const counts = STAGE_ORDER.map(() => 0);
    for (const rank of furthest.values()) {
      for (let i = 0; i <= rank; i++) counts[i]++;
    }

    const startedCount = counts[0] || 0;
    const stages = STAGE_ORDER.map((stage, i) => {
      const count = counts[i];
      const prev = i > 0 ? counts[i - 1] : count;
      return {
        stage,
        label: STAGE_LABEL[stage],
        count,
        pctOfStart: startedCount > 0 ? count / startedCount : 0,
        pctOfPrev: prev > 0 ? count / prev : 0,
        dropFromPrev: Math.max(0, prev - count),
      };
    });

    return NextResponse.json({
      window: days === 0 ? "all" : `${days}d`,
      generatedAt: new Date().toISOString(),
      startedCount,
      paidCount: counts[STAGE_ORDER.length - 1] || 0,
      conversionRate: startedCount > 0 ? (counts[STAGE_ORDER.length - 1] || 0) / startedCount : 0,
      uniqueConversations: furthest.size,
      stages,
    });
  },
);
