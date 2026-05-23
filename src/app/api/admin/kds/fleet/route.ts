import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getKdsStationAnalytics, getOrders } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import type { Order, OrderStatus } from "@/data/types";

/**
 * Owner fleet command — live KDS health across every active truck.
 *
 * Real-time signals (open tickets / late / oldest age) read the same active
 * orders the KDS boards do, including simulated tickets ({ includeSimulated })
 * so a simulator-driven demo lights the fleet view up exactly like a real
 * rush. Bump-time percentiles come from getKdsStationAnalytics (real
 * kds_tickets only — simulated orders don't fire station tickets, so P95 is
 * "—" during a pure-sim demo, which is honest).
 *
 * Owner-only and inherently cross-location, so no locationParam — withAdmin
 * allows the cross-location read for an unrestricted owner session.
 */

const ACTIVE_STATUSES: OrderStatus[] = ["confirmed", "preparing", "ready"];

function elapsedSeconds(o: Order, now: number): number {
  const base = o.paidAt ? Date.parse(o.paidAt) : Date.parse(o.createdAt);
  return Number.isFinite(base) ? Math.max(0, Math.round((now - base) / 1000)) : 0;
}

function remainingSlaSeconds(o: Order, now: number): number | null {
  if (!o.estimatedReadyAt) return null;
  const target = Date.parse(o.estimatedReadyAt);
  if (!Number.isFinite(target)) return null;
  return Math.round((target - now) / 1000);
}

export const GET = withAdmin({ roles: ["owner"] }, async () => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const fromIso = todayStart.toISOString();
  const toIso = new Date(now).toISOString();

  const locations = await getActiveLocationsAsync();

  const tiles = await Promise.all(
    locations.map(async (loc) => {
      const orders = await getOrders(loc.slug, fromIso, { includeSimulated: true });
      const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));

      let late = 0;
      let warning = 0;
      let oldestAgeSec = 0;
      for (const o of active) {
        const age = elapsedSeconds(o, now);
        if (age > oldestAgeSec) oldestAgeSec = age;
        if (o.status === "ready") continue; // expo waiting, not "late prep"
        const rem = remainingSlaSeconds(o, now);
        if (rem !== null && rem < 0) late++;
        else if (rem !== null && rem < 180) warning++;
      }

      const completed = orders.filter((o) => o.status === "completed");
      const completedToday = completed.length;
      const revenueToday = completed.reduce((s, o) => s + (o.totalAmount ?? 0), 0);

      const stations = await getKdsStationAnalytics(loc.slug, fromIso, toIso);
      const worstStationP95Ms = stations.length > 0 ? stations[0].p95BumpMs : null;
      const ticketsBumped = stations.reduce((s, r) => s + r.ticketCount, 0);

      const health: "red" | "amber" | "green" =
        late > 0 ? "red" : warning > 0 ? "amber" : "green";

      return {
        slug: loc.slug,
        name: loc.name,
        open: active.length,
        late,
        warning,
        oldestAgeSec,
        completedToday,
        revenueToday,
        worstStationP95Ms,
        ticketsBumped,
        health,
      };
    }),
  );

  const totals = {
    open: tiles.reduce((s, t) => s + t.open, 0),
    late: tiles.reduce((s, t) => s + t.late, 0),
    completedToday: tiles.reduce((s, t) => s + t.completedToday, 0),
    revenueToday: tiles.reduce((s, t) => s + t.revenueToday, 0),
    trucksInRed: tiles.filter((t) => t.health === "red").length,
  };

  return NextResponse.json({ generatedAt: toIso, totals, tiles });
});
