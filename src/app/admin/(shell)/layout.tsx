import "../../themes/admin-v3/index.css";
import "../../themes/admin-v3/skins/blueprint.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { AdminShellV3 } from "@/admin-v3/AdminShellV3";
import { CurrencyGuard } from "@/shared/CurrencyGuard";
import { SimulationBanner } from "@/components/system/SimulationBanner";
import { themeBootScriptV3 } from "@/admin-v3/theme";
import { getThemeSkinSettings } from "@/lib/store";

// v3 owns its own next/font instances (namespaced --font-admin-*), independent
// of the v2 admin layout so deleting v2 can't drift v3's typefaces.
const body = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Admin v3 | Ottaviano",
  robots: "noindex, nofollow",
};

// The layout server-renders the DB-global active skin onto `data-skin`, so the
// surface must render per-request — otherwise the few statically-prerendered
// admin pages (e.g. /admin/boardroom, /admin/comms) would bake the build-time
// skin and ignore later swaps. Admin is authenticated + noindex, so forcing
// dynamic costs nothing (most /admin pages are already dynamic via cookie auth).
export const dynamic = "force-dynamic";

export default async function AdminV3Layout({ children }: { children: React.ReactNode }) {
  // DB-global active admin skin. Rendered onto `data-skin` so the alternate
  // skin's CSS (scoped under `.av3-root[data-skin="…"]`) takes over. The admin
  // surface is already dynamic (cookie auth), so this server read is free and
  // there's no pre-paint flash. Default skin = the shipped Operator Terminal.
  const skins = await getThemeSkinSettings();
  return (
    // `#admin-portal-root` is the in-scope, trap-free portal mount + the carrier
    // of the --font-admin-* next/font vars (same pattern as the v2 admin layout).
    // `.av3-root` scopes all --av3-* tokens so they can't leak to v2.
    <div
      id="admin-portal-root"
      data-skin={skins.admin}
      className={`${body.variable} ${display.variable} ${mono.variable} av3-root flex flex-col flex-1`}
    >
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: themeBootScriptV3 }}
      />
      {/* Pin formatPrice() to PLN across the admin surface (operator currency). */}
      <CurrencyGuard />
      <SimulationBanner />
      <AdminShellV3>{children}</AdminShellV3>
    </div>
  );
}
