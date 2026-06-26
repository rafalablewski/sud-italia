import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  ChefHat,
  ClipboardList,
  Users,
  ConciergeBell,
  ArrowUpRight,
} from "lucide-react";
import { isAuthenticated, getCurrentAdminUser } from "@/lib/admin-auth";
import { CORE_SURFACES } from "@/core/routes";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { OperatorPushOptInButton } from "@/components/pwa/OperatorPushOptInButton";

export const dynamic = "force-dynamic";

// The OttavianoKDS home: one launcher into the whole operator suite — Admin
// back-office + every Core surface (POS, KDS, Orders, Guest, Service). Big
// touch targets for tablets/iPads; auth-gated like the surfaces it links to.
const TILES = [
  {
    href: "/admin",
    label: "Admin",
    desc: "Full back-office — orders, menu, recipes, finance, growth, reports",
    Icon: LayoutDashboard,
    accent: "#E8B23A",
  },
  {
    href: CORE_SURFACES.pos,
    label: "Point of sale",
    desc: "Take and charge orders at the till",
    Icon: Receipt,
    accent: "#33C26A",
  },
  {
    href: CORE_SURFACES.kds,
    label: "Kitchen display",
    desc: "Live cooking queue — bump tickets as they fire and finish",
    Icon: ChefHat,
    accent: "#E11D36",
  },
  {
    href: CORE_SURFACES.orders,
    label: "Orders",
    desc: "Track every order through the pipeline",
    Icon: ClipboardList,
    accent: "#6EA8FE",
  },
  {
    href: CORE_SURFACES.guest,
    label: "Guest",
    desc: "Bookings, tables and the guest book",
    Icon: Users,
    accent: "#C792EA",
  },
  {
    href: CORE_SURFACES.service,
    label: "Service",
    desc: "Front-of-house service board",
    Icon: ConciergeBell,
    accent: "#E8B23A",
  },
] as const;

export default async function OperatorHome() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  const user = await getCurrentAdminUser();
  const firstName = user?.name?.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-[max(2rem,env(safe-area-inset-top))]">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "linear-gradient(160deg,#16202C,#070A0F)", border: "1px solid #2B3A4D" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/kds/icon-192.png" alt="" width={36} height={36} className="rounded-lg" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">OttavianoKDS</h1>
              <p className="text-sm text-neutral-400">Admin &amp; Core — operator app</p>
            </div>
          </div>
          {firstName && (
            <p className="mt-3 text-sm text-neutral-300">
              Welcome back, <span className="font-semibold text-white">{firstName}</span>.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OperatorPushOptInButton />
          <InstallAppButton appName="OttavianoKDS" tone="dark" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map(({ href, label, desc, Icon, accent }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-[#2B3A4D] bg-[#11161F] p-5 transition hover:border-[#3A4A5E] hover:bg-[#16202C] active:scale-[0.99]"
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
            <div className="flex items-start justify-between">
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: `${accent}1A`, color: accent }}
              >
                <Icon size={24} aria-hidden />
              </span>
              <ArrowUpRight
                size={20}
                aria-hidden
                className="text-neutral-600 transition group-hover:text-neutral-300"
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{label}</h2>
              <p className="mt-1 text-sm leading-snug text-neutral-400">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-500">
        <Link href="/kitchen" className="hover:text-neutral-300">
          Legacy kitchen display →
        </Link>
        <Link href="/capabilities" className="hover:text-neutral-300">
          What&apos;s deployed →
        </Link>
        <Link href="/" className="hover:text-neutral-300">
          Open the customer app (Ottaviano) →
        </Link>
      </div>
    </main>
  );
}
