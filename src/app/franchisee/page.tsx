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
    <main style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>Franchisee Portal</h1>
      <p style={{ color: "#666", marginBottom: "24px" }}>
        Welcome, {user.name}. Royalty statements run every Monday at 02:00 UTC.
      </p>

      {data.length === 0 && (
        <p style={{ color: "#666" }}>
          No franchisee data linked to your account yet. Contact your brand owner.
        </p>
      )}

      {data.map(({ franchisee, locations, rolling7, latestStatement }) => (
        <section
          key={franchisee.id}
          style={{
            background: "white",
            border: "1px solid #e5e5e5",
            borderRadius: "8px",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ fontSize: "20px", marginBottom: "4px" }}>{franchisee.name}</h2>
          <p style={{ color: "#666", fontSize: "13px", marginBottom: "16px" }}>
            Royalty {franchisee.royaltyRateBps / 100}% · Marketing fund{" "}
            {franchisee.marketingFundBps / 100}%
          </p>

          <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "#666", marginBottom: "4px" }}>
            Locations ({locations.length})
          </h3>
          <ul style={{ marginBottom: "16px" }}>
            {locations.map((loc) => (
              <li key={loc.slug}>{loc.name}</li>
            ))}
            {locations.length === 0 && <li style={{ color: "#999" }}>No locations assigned</li>}
          </ul>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "#666", marginBottom: "4px" }}>
                Last 7 days
              </h3>
              <div style={{ fontSize: "20px", fontWeight: 600 }}>
                {formatPrice(rolling7.revenueGrosze)} PLN
              </div>
              <div style={{ color: "#666", fontSize: "13px" }}>{rolling7.orderCount} orders</div>
            </div>
            <div>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "#666", marginBottom: "4px" }}>
                Latest statement
              </h3>
              {latestStatement ? (
                <>
                  <div style={{ fontSize: "20px", fontWeight: 600 }}>
                    {formatPrice(latestStatement.royaltyGrosze)} PLN
                  </div>
                  <div style={{ color: "#666", fontSize: "13px" }}>
                    week ending {latestStatement.periodEnd.slice(0, 10)}
                  </div>
                </>
              ) : (
                <div style={{ color: "#999" }}>No statements yet</div>
              )}
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}
