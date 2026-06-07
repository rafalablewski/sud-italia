import "../themes/base/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { AdminShell } from "@/components/admin/v2/AdminShell";
import { AdminCurrencyGuard } from "@/shared/AdminCurrencyGuard";
import { themeBootScript } from "@/shared/theme";

// Admin fonts — owned by the Admin theme. Independent next/font calls
// from the Homepage layout so a weight / subset change here can't move
// the storefront. Variable names are namespaced (--font-admin-*) and
// the admin CSS (themes/base/index.css) reads through them as
// var(--font-ui) / var(--font-display).
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
// Mono — JetBrains Mono for code-like admin numerals (ids / prices / timers).
const adminMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-admin-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Admin | Sud Italia",
  robots: "noindex, nofollow",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `id` is a stable portal mount for overlays that must escape the
    // `.admin-bg > *` stacking trap (rule #4) yet stay inside the admin font
    // scope (these `--font-admin-*` next/font vars live here, not on <body>).
    // The Core suite (/core/*) is its own top-level segment with its own
    // layout that re-creates this same `#admin-portal-root` wrapper — so each
    // tree has an in-scope, trap-free node to portal into.
    <div id="admin-portal-root" className={`${adminBody.variable} ${adminDisplay.variable} ${adminMono.variable} flex flex-col flex-1`}>
      {/*
        Inline script runs synchronously during HTML parse to apply the
        persisted theme before paint. No flash of incorrect mode. This is the
        standard pattern used by next-themes / theme-aware sites. `Script` with
        beforeInteractive is restricted to the root layout in App Router.
      */}
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: themeBootScript }}
      />
      {/* Force-pins formatPrice() to PLN across all /admin routes so the
          operator never picks up the customer's display-currency
          preference from the shared cookie / localStorage. */}
      <AdminCurrencyGuard />
      <AdminShell>
        {/* Inner .admin-bg preserves legacy page styles during migration */}
        <div className="admin-bg">{children}</div>
      </AdminShell>
    </div>
  );
}
