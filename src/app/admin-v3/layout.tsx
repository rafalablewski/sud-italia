import "../themes/admin-v3/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { AdminShellV3 } from "@/admin-v3/AdminShellV3";
import { AdminCurrencyGuard } from "@/shared/AdminCurrencyGuard";
import { themeBootScriptV3 } from "@/admin-v3/theme";

// v3 owns its own next/font instances (namespaced --font-admin-*), independent
// of the v2 admin layout so deleting v2 can't drift v3's typefaces.
const body = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Admin v3 | Sud Italia",
  robots: "noindex, nofollow",
};

export default function AdminV3Layout({ children }: { children: React.ReactNode }) {
  return (
    // `#admin-portal-root` is the in-scope, trap-free portal mount + the carrier
    // of the --font-admin-* next/font vars (same pattern as the v2 admin layout).
    // `.av3-root` scopes all --av3-* tokens so they can't leak to v2.
    <div
      id="admin-portal-root"
      className={`${body.variable} ${display.variable} ${mono.variable} av3-root flex flex-col flex-1`}
    >
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: themeBootScriptV3 }}
      />
      {/* Pin formatPrice() to PLN across the admin surface (operator currency). */}
      <AdminCurrencyGuard />
      <AdminShellV3>{children}</AdminShellV3>
    </div>
  );
}
