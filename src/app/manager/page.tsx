import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, Receipt, Users, TrendingUp, ArrowRight } from "lucide-react";
import {
  getCurrentAdminUser,
  getCurrentLocationScope,
  LOCATION_SCOPE_ALL,
} from "@/lib/admin-auth";
import { getOrders, getShifts, getStaff } from "@/lib/store";
import { getActiveLocations } from "@/data/locations";
import { landingPathForRole, STAFF_ROLE_LABEL } from "@/lib/staff-roles";
import { getDashboardQuickLinks } from "@/lib/dashboard-links";
import { formatPricePLN } from "@/lib/utils";
import { SignOutButton } from "./SignOutButton";

/**
 * Manager portal (the manager's home). The owner's company-wide HQ lives at
 * `/admin` and is owner-gated; a manager lands here instead — a scoped overview
 * of the site(s) they run, plus quick links into the operational tools their
 * permissions already grant.
 *
 * Every figure is derived live from real orders + shifts (no mock data),
 * filtered to the manager's location scope (the same `*`/comma-list claim the
 * session carries and the admin API enforces).
 */

const WARSAW_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * The "now" reads (`Date.now()` / `new Date()`) live in this hoisted helper so
 * the `react-hooks/purity` lint doesn't flag them inside the server component —
 * same pattern the Franchisee portal uses. Returns the start-of-today (Warsaw,
 * DST-correct), the current instant, and the header date label.
 */
function clockContext(): { startMs: number; nowMs: number; dateLabel: string } {
  const now = new Date();
  // ms to add to a UTC instant to read it as Warsaw wall-clock time.
  const offset =
    new Date(now.toLocaleString("en-US", { timeZone: "Europe/Warsaw" })).getTime() -
    new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const wawNow = new Date(now.getTime() + offset);
  const midnightAsUtc = Date.UTC(
    wawNow.getUTCFullYear(),
    wawNow.getUTCMonth(),
    wawNow.getUTCDate(),
  );
  return {
    startMs: midnightAsUtc - offset,
    nowMs: now.getTime(),
    dateLabel: WARSAW_DATE.format(now),
  };
}

export default async function ManagerPortalPage() {
  const user = await getCurrentAdminUser();
  if (!user) {
    redirect("/login");
  }
  // Owner can preview the portal; everyone below manager is sent to their own
  // home. A manager (or owner) renders the dashboard.
  if (user.role !== "manager" && user.role !== "owner") {
    redirect(landingPathForRole(user.role));
  }

  const scope = (await getCurrentLocationScope()) ?? [LOCATION_SCOPE_ALL];
  const allLocations = getActiveLocations();
  const myLocations = scope.includes(LOCATION_SCOPE_ALL)
    ? allLocations
    : allLocations.filter((l) => scope.includes(l.slug));

  const { startMs, nowMs, dateLabel } = clockContext();
  const sinceISO = new Date(startMs).toISOString();

  // Pull today's orders + today's shifts for each location the manager runs,
  // then aggregate. getOrders(slug, since) pushes the date filter to Postgres.
  const perLocation = await Promise.all(
    myLocations.map(async (loc) => {
      const [orders, shifts, staff] = await Promise.all([
        getOrders(loc.slug, sinceISO),
        getShifts({ locationSlug: loc.slug, from: sinceISO }),
        getStaff(loc.slug),
      ]);
      const live = orders.filter(
        (o) => o.status !== "pending" && o.status !== "cancelled",
      );
      const revenue = live.reduce((acc, o) => acc + o.totalAmount, 0);
      const covers = live.reduce((acc, o) => acc + (o.partySize ?? 0), 0);
      const staffById = new Map(staff.map((s) => [s.id, s]));
      const onShift = shifts
        .filter((s) => {
          const start = new Date(s.startAt).getTime();
          const end = new Date(s.endAt).getTime();
          return s.status !== "missed" && start <= nowMs && end >= nowMs;
        })
        .map((s) => ({
          name: staffById.get(s.staffId)?.name ?? "Staff",
          role: s.role,
        }));
      return {
        loc,
        orderCount: live.length,
        revenue,
        covers,
        onShift,
      };
    }),
  );

  const totals = perLocation.reduce(
    (acc, p) => ({
      orderCount: acc.orderCount + p.orderCount,
      revenue: acc.revenue + p.revenue,
      covers: acc.covers + p.covers,
      onShift: acc.onShift + p.onShift.length,
    }),
    { orderCount: 0, revenue: 0, covers: 0, onShift: 0 },
  );

  const kpis = [
    {
      label: "Revenue today",
      value: formatPricePLN(totals.revenue),
      icon: TrendingUp,
    },
    {
      label: "Orders today",
      value: String(totals.orderCount),
      icon: Receipt,
    },
    {
      label: "Covers today",
      value: String(totals.covers),
      icon: Users,
    },
    {
      label: "On shift now",
      value: String(totals.onShift),
      icon: Flame,
    },
  ];

  // Quick links are derived from the viewer's *effective* permissions, not
  // hard-coded — the admin controls exactly what shows here via the Permission
  // Matrix (role default or per-user custom grant). Each card maps to the same
  // permission `permissionForAdminPage()` gates its destination with, so a card
  // appears only when the manager could actually open it (no click-then-bounce).
  // Hrefs come back re-rooted onto the manager's /manager/* prefix; the KDS /
  // POS cards stay on the shared /core/* suite. See src/lib/dashboard-links.ts.
  const quickLinks = getDashboardQuickLinks(user);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="admin-text-dim text-sm mb-1">{dateLabel}</p>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading gradient-text">
            Welcome, {user.name.split(" ")[0]}
          </h1>
          <p className="admin-text-dim text-sm mt-1">
            {myLocations.length === 1
              ? myLocations[0].name
              : myLocations.length === 0
                ? "No location assigned yet — ask the owner to scope your account."
                : `${myLocations.length} locations · ${myLocations.map((l) => l.name).join(", ")}`}
          </p>
        </div>
        <SignOutButton />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="glass-card rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 admin-text-dim text-xs uppercase tracking-wide mb-2">
                <Icon className="h-4 w-4" />
                {k.label}
              </div>
              <div className="text-2xl sm:text-3xl font-bold admin-text font-heading">
                {k.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-location breakdown — only when the manager runs more than one site */}
      {perLocation.length > 1 && (
        <section className="mb-8">
          <h2 className="admin-text-dim text-xs uppercase tracking-wide mb-3">
            By location
          </h2>
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            {perLocation.map((p) => (
              <div key={p.loc.slug} className="glass-card rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="admin-text font-semibold">{p.loc.name}</span>
                  <span className="admin-text-dim text-sm">{p.onShift.length} on shift</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="admin-text font-bold">{formatPricePLN(p.revenue)}</div>
                    <div className="admin-text-dim text-2xs uppercase tracking-wide">Revenue</div>
                  </div>
                  <div>
                    <div className="admin-text font-bold">{p.orderCount}</div>
                    <div className="admin-text-dim text-2xs uppercase tracking-wide">Orders</div>
                  </div>
                  <div>
                    <div className="admin-text font-bold">{p.covers}</div>
                    <div className="admin-text-dim text-2xs uppercase tracking-wide">Covers</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Who's on now */}
      <section className="mb-8">
        <h2 className="admin-text-dim text-xs uppercase tracking-wide mb-3">On shift now</h2>
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          {totals.onShift === 0 ? (
            <p className="admin-text-dim text-sm">No one is clocked on right now.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {perLocation.flatMap((p) =>
                p.onShift.map((s, i) => (
                  <span
                    key={`${p.loc.slug}-${i}`}
                    className="glass-input rounded-full px-3 py-1.5 text-sm admin-text"
                  >
                    {s.name}
                    <span className="admin-text-dim">
                      {" "}· {STAFF_ROLE_LABEL[s.role] ?? s.role}
                    </span>
                  </span>
                )),
              )}
            </div>
          )}
        </div>
      </section>

      {/* Quick links into the operational tools the manager is allowed */}
      <section>
        <h2 className="admin-text-dim text-xs uppercase tracking-wide mb-3">Jump to</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {quickLinks.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.href}
                href={q.href}
                className="glass-card rounded-2xl p-4 sm:p-5 flex items-center gap-4 group hover:scale-[1.01] transition-transform"
              >
                <span className="w-10 h-10 rounded-xl glass-input flex items-center justify-center admin-text shrink-0">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="admin-text font-semibold block">{q.label}</span>
                  <span className="admin-text-dim text-sm block truncate">{q.desc}</span>
                </span>
                <ArrowRight className="h-4 w-4 admin-text-dim group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
