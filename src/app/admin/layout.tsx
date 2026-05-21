import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/v2/AdminShell";
import { AdminCurrencyGuard } from "@/components/admin/AdminCurrencyGuard";
import { themeBootScript } from "@/components/admin/v2/theme";

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
    <>
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
    </>
  );
}
