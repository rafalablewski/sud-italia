import "../themes/admin/index.css";
import "../themes/core/index.css";
import "../themes/core/suite.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { AdminCurrencyGuard } from "@/components/admin/AdminCurrencyGuard";
import { themeBootScript } from "@/components/admin/v2/theme";
import { CoreProviders } from "./CoreProviders";

// The Core suite (POS, KDS, Guest Engagement, Service) is the operational,
// staff-facing layer — distinct from the owner's back-office. It used to live
// under /admin/* and render through AdminShell's chrome-less "core" branch;
// now it owns the top-level /core/* segment. This layout loads the same Admin
// theme CSS + Core suite CSS + admin fonts the AdminShell gave it, keeps the
// `#admin-portal-root` mount (KDS fullscreen + ui/portal.ts target it) and the
// PLN currency pin, then hands off to CoreProviders for the data providers.
// Independent next/font instances from /admin/layout so a Core-only font tweak
// wouldn't move admin.
const adminBody = Inter({
  subsets: ["latin"],
  variable: "--font-admin-body",
  display: "swap",
});
const adminDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-admin-display",
  display: "swap",
});
const adminMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-admin-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Core | Sud Italia",
  robots: "noindex, nofollow",
};

export default function CoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="admin-portal-root"
      className={`${adminBody.variable} ${adminDisplay.variable} ${adminMono.variable} flex flex-col flex-1`}
    >
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      <AdminCurrencyGuard />
      <CoreProviders>{children}</CoreProviders>
    </div>
  );
}
