import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import {
  getFranchisees,
  getLocationsForFranchisee,
  getOrders,
  getRoyaltyStatements,
} from "@/lib/store";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { SignOutButton } from "../manager/SignOutButton";

// Hoisted outside the component to keep
// `react-hooks/components-and-hooks-must-be-pure` happy — the rule
// flags Date.now() inside any PascalCase function body, even on the
// server. Server components are allowed to be impure but the linter
// can't tell.
function sevenDaysAgoMs(): number {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

/**
 * Franchisee portal landing (m3_3). Restricted to role:"franchisee".
 * Shows their scope (locations under their banner), 7-day rolling
 * revenue across those locations, and the latest royalty statement.
 *
 * Cross-location reads happen server-side here — getOrders is unscoped
 * because the franchisee owns multiple locations within their tenancy;
 * the m0_5 locationScope claim on their session restricts them at the
 * admin API boundary so they can never reach into another franchisee's
 * data even if they craft a URL by hand.
 */
export default async function FranchiseePortalPage() {
  const user = await getCurrentAdminUser();
  if (!user) {
    redirect("/admin/login?next=/franchisee");
  }
  if (user.role !== "franchisee" && user.role !== "owner") {
    redirect("/admin");
  }

  // Owners see all franchisees; an actual franchisee user sees just
  // their own row. We model the link via admin_users.locationSlug for
  // now — m3_3b will add a franchisee_id column on admin_users so an
  // owner can act as a specific franchisee for testing.
  const allFranchisees = await getFranchisees();
  const myFranchisees = user.role === "owner"
    ? allFranchisees
    : allFranchisees.filter((f) => f.email === user.email);

  // Per franchisee: locations + last 7 days revenue + latest statement.
  const data = await Promise.all(
    myFranchisees.map(async (f) => {
      const locationSlugs = await getLocationsForFranchisee(f.id);
      const allLocations = getActiveLocations();
      const locations = allLocations.filter((l) => locationSlugs.includes(l.slug));
      const orders = await getOrders();
      const since = sevenDaysAgoMs();
      const periodOrders = orders.filter((o) => {
        if (!locationSlugs.includes(o.locationSlug)) return false;
        if (o.status === "pending" || o.status === "cancelled") return false;
        const t = new Date(o.paidAt || o.createdAt).getTime();
        return t >= since;
      });
      const revenueGrosze = periodOrders.reduce((acc, o) => acc + o.totalAmount, 0);
      const statements = await getRoyaltyStatements(f.id);
      return {
        franchisee: f,
        locations,
        rolling7: {
          orderCount: periodOrders.length,
          revenueGrosze,
        },
        latestStatement: statements[0] ?? null,
      };
    }),
  );

  return (
    <main className="av3-portal">
      <div className="av3-portal-col">
        <div className="av3-portal-head">
          <div>
            <div className="av3-auth-lockup" style={{ marginBottom: 0 }}>
              <span className="av3-auth-mark">SI</span>
              <div>
                <div className="av3-auth-wordmark">Ottaviano</div>
                <div className="av3-auth-eyebrow">Franchisee</div>
              </div>
            </div>
            <h1 className="av3-portal-greet">Welcome, {user.name.split(" ")[0]}</h1>
            <p className="av3-portal-sub">Royalty statements run every Monday at 02:00 UTC.</p>
          </div>
          <SignOutButton />
        </div>

        {data.length === 0 && (
          <div className="av3-card">
            <p className="av3-portal-empty">
              No franchisee data linked to your account yet. Contact your brand owner.
            </p>
          </div>
        )}

        {data.map(({ franchisee, locations, rolling7, latestStatement }) => (
          <section className="av3-portal-section" key={franchisee.id}>
            <div className="av3-card">
              <div className="av3-card-head">
                <div>
                  <div className="av3-card-title">{franchisee.name}</div>
                  <div className="av3-card-desc">
                    Royalty {franchisee.royaltyRateBps / 100}% · Marketing fund{" "}
                    {franchisee.marketingFundBps / 100}%
                  </div>
                </div>
                <span className="av3-badge av3-badge-neutral">
                  {locations.length} {locations.length === 1 ? "location" : "locations"}
                </span>
              </div>
              <div className="av3-card-body">
                <div className="av3-portal-chips" style={{ marginBottom: "var(--av3-gap-4)" }}>
                  {locations.map((loc) => (
                    <span key={loc.slug} className="av3-portal-chip">
                      {loc.name}
                    </span>
                  ))}
                  {locations.length === 0 && (
                    <span style={{ fontSize: "12px", color: "var(--av3-subtle)" }}>
                      No locations assigned
                    </span>
                  )}
                </div>

                <div className="av3-cols-2" style={{ gap: "var(--av3-gap-4)" }}>
                  <div>
                    <div className="av3-portal-stat-label">Last 7 days</div>
                    <div className="av3-portal-stat-value">{formatPrice(rolling7.revenueGrosze)} PLN</div>
                    <div className="av3-portal-stat-sub">{rolling7.orderCount} orders</div>
                  </div>
                  <div>
                    <div className="av3-portal-stat-label">Latest statement</div>
                    {latestStatement ? (
                      <>
                        <div className="av3-portal-stat-value">
                          {formatPrice(latestStatement.royaltyGrosze)} PLN
                        </div>
                        <div className="av3-portal-stat-sub">
                          week ending {latestStatement.periodEnd.slice(0, 10)}
                        </div>
                      </>
                    ) : (
                      <div className="av3-portal-stat-sub">No statements yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
