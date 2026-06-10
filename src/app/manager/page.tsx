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
import { PortalInbox } from "@/components/portal/PortalInbox";
import { CommsBell } from "@/components/portal/CommsBell";
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
      accent: "var(--av3-brand)",
    },
    {
      label: "Orders today",
      value: String(totals.orderCount),
      icon: Receipt,
      accent: "var(--av3-info)",
    },
    {
      label: "Covers today",
      value: String(totals.covers),
      icon: Users,
      accent: "var(--av3-platinum)",
    },
    {
      label: "On shift now",
      value: String(totals.onShift),
      icon: Flame,
      accent: "var(--av3-ok)",
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

  const locationLine =
    myLocations.length === 1
      ? myLocations[0].name
      : myLocations.length === 0
        ? "No location assigned yet — ask the owner to scope your account."
        : `${myLocations.length} locations · ${myLocations.map((l) => l.name).join(", ")}`;

  return (
    <main className="av3-portal">
      <div className="av3-portal-col">
        {/* Header — the sign-in lockup (mark + Ottaviano wordmark + eyebrow),
            so the portal home reads as the same surface as the door. */}
        <div className="av3-portal-head">
          <div>
            <div className="av3-auth-lockup" style={{ marginBottom: 0 }}>
              <span className="av3-auth-mark">SI</span>
              <div>
                <div className="av3-auth-wordmark">Ottaviano</div>
                <div className="av3-auth-eyebrow">Manager · {dateLabel}</div>
              </div>
            </div>
            <h1 className="av3-portal-greet">Welcome, {user.name.split(" ")[0]}</h1>
            <p className="av3-portal-sub">{locationLine}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CommsBell />
            <SignOutButton />
          </div>
        </div>

        {/* KPI rail */}
        <div className="av3-kpi-rail">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                className="av3-kpi"
                style={{ ["--av3-kpi-accent" as string]: k.accent }}
              >
                <div className="av3-kpi-label">
                  <Icon />
                  {k.label}
                </div>
                <div className="av3-kpi-value">{k.value}</div>
              </div>
            );
          })}
        </div>

        {/* Personal comms — announcement notifications inbox + this manager's to-do list */}
        <PortalInbox />

        {/* Per-location breakdown — only when the manager runs more than one site */}
        {perLocation.length > 1 && (
          <section className="av3-portal-section">
            <div className="av3-section-label">By location</div>
            <div className="av3-cols-2" style={{ gap: "var(--av3-gap-3)" }}>
              {perLocation.map((p) => (
                <div key={p.loc.slug} className="av3-card av3-card-p">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "var(--av3-gap-3)",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{p.loc.name}</span>
                    <span style={{ fontSize: "11.5px", color: "var(--av3-muted)" }}>
                      {p.onShift.length} on shift
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--av3-gap-3)" }}>
                    <div>
                      <div className="av3-portal-stat-value">{formatPricePLN(p.revenue)}</div>
                      <div className="av3-portal-stat-label">Revenue</div>
                    </div>
                    <div>
                      <div className="av3-portal-stat-value">{p.orderCount}</div>
                      <div className="av3-portal-stat-label">Orders</div>
                    </div>
                    <div>
                      <div className="av3-portal-stat-value">{p.covers}</div>
                      <div className="av3-portal-stat-label">Covers</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Who's on now */}
        <section className="av3-portal-section">
          <div className="av3-section-label">On shift now</div>
          <div className="av3-card av3-card-p">
            {totals.onShift === 0 ? (
              <p style={{ margin: 0, fontSize: "12.5px", color: "var(--av3-muted)" }}>
                No one is clocked on right now.
              </p>
            ) : (
              <div className="av3-portal-chips">
                {perLocation.flatMap((p) =>
                  p.onShift.map((s, i) => (
                    <span key={`${p.loc.slug}-${i}`} className="av3-portal-chip">
                      {s.name}
                      <span>· {STAFF_ROLE_LABEL[s.role] ?? s.role}</span>
                    </span>
                  )),
                )}
              </div>
            )}
          </div>
        </section>

        {/* Quick links into the operational tools the manager is allowed */}
        <section className="av3-portal-section">
          <div className="av3-section-label">Jump to</div>
          <div className="av3-portal-jump">
            {quickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <Link key={q.href} href={q.href} className="av3-portal-jcard">
                  <span className="av3-portal-jico">
                    <Icon />
                  </span>
                  <span className="av3-portal-jbody">
                    <span className="av3-portal-jname">{q.label}</span>
                    <span className="av3-portal-jdesc">{q.desc}</span>
                  </span>
                  <ArrowRight />
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
