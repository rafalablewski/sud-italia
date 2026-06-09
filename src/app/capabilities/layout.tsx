import "../themes/base/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { CurrencyGuard } from "@/shared/CurrencyGuard";
import { themeBootScript } from "@/shared/theme";

/**
 * Capabilities ledger — a standalone, shell-less route (Rule #9 source of
 * truth for what's deployed). It used to live under `/admin` inside the v2
 * AdminShell; re-homed here so it survives the v2 deletion. It renders with the
 * shared base CSS (`.v2-card` / `.admin-text` / `PageHero`) on `.admin-bg`,
 * gates auth itself, and is linked from the admin nav (`/admin/capabilities`
 * → here). Like the other shell-less portals, it loads the base theme CSS +
 * admin fonts directly and pins PLN.
 */
const body = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Capabilities | Ottaviano",
  robots: "noindex, nofollow",
};

export default function CapabilitiesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="admin-portal-root"
      className={`${body.variable} ${display.variable} ${mono.variable} admin-bg`}
    >
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      <CurrencyGuard />
      {children}
    </div>
  );
}
