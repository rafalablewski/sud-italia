import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getComplianceItems, getOrders } from "@/lib/store";
import { getActiveLocations } from "@/data/locations";

/**
 * HQ rollup (m3_7+). Owner-only multi-location KPIs over a date window.
 * Per-location revenue / orders / AOV / compliance score, sorted by
 * revenue desc so the operator sees winners + laggards in one glance.
 *
 * Owner-only: rolls up data across every franchisee, so this can't
 * leak to a scoped session. The role gate is hard.
 *
 * Defaults to the trailing 30 days when from/to omitted.
 */
export const GET = withAdmin(
  { roles: ["owner"] },
  async (req) => {
    const to = req.nextUrl.searchParams.get("to") ?? new Date().toISOString();
    const from =
      req.nextUrl.searchParams.get("from") ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const locations = getActiveLocations();
    const allOrders = await getOrders();
    const now = Date.now();
    // "Soon" = within 30 days of expiry.
    const SOON_MS = 30 * 24 * 60 * 60 * 1000;

    const perLocation = await Promise.all(
      locations.map(async (loc) => {
        const periodOrders = allOrders.filter((o) => {
          if (o.locationSlug !== loc.slug) return false;
          if (o.status === "pending" || o.status === "cancelled") return false;
          const t = new Date(o.paidAt || o.createdAt).getTime();
          return t >= fromMs && t <= toMs;
        });
        const revenueGrosze = periodOrders.reduce((acc, o) => acc + o.totalAmount, 0);
        const orderCount = periodOrders.length;
        const avgOrderValueGrosze = orderCount > 0 ? Math.round(revenueGrosze / orderCount) : 0;

        // Compliance heatmap (m3_9): count items expired / expiring soon
        // / OK. Surfaced as a tile per location on the HQ dashboard.
        const compliance = await getComplianceItems(loc.slug);
        let expired = 0;
        let expiringSoon = 0;
        let ok = 0;
        for (const c of compliance) {
          const t = new Date(c.expiresAt).getTime();
          if (!Number.isFinite(t)) continue;
          if (t < now) expired += 1;
          else if (t - now < SOON_MS) expiringSoon += 1;
          else ok += 1;
        }

        return {
          slug: loc.slug,
          name: loc.name,
          revenueGrosze,
          orderCount,
          avgOrderValueGrosze,
          compliance: { expired, expiringSoon, ok },
          // Brand-standards composite score (m3_10) — simple v1:
          // 100 - (expired * 20) - (expiringSoon * 5). Floor at 0.
          // Mystery-shopper manual entry can blend in later via a
          // separate input table.
          standardsScore: Math.max(
            0,
            100 - expired * 20 - expiringSoon * 5,
          ),
        };
      }),
    );

    perLocation.sort((a, b) => b.revenueGrosze - a.revenueGrosze);
    const totals = perLocation.reduce(
      (acc, r) => ({
        revenueGrosze: acc.revenueGrosze + r.revenueGrosze,
        orderCount: acc.orderCount + r.orderCount,
      }),
      { revenueGrosze: 0, orderCount: 0 },
    );

    return NextResponse.json({
      from,
      to,
      locations: perLocation,
      totals: {
        ...totals,
        avgOrderValueGrosze:
          totals.orderCount > 0 ? Math.round(totals.revenueGrosze / totals.orderCount) : 0,
        locationCount: perLocation.length,
      },
    });
  },
);
