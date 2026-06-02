import "../themes/admin/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";

// Franchisee portal is admin-flavoured (reads getCurrentAdminUser,
// role-gated to "franchisee" / "owner"). It lives outside the
// AdminShell so this layout loads the Admin theme CSS + admin fonts
// directly. Independent next/font instances so a franchisee-only
// type tweak would not move /admin.
const franchiseeBody = Inter({
  subsets: ["latin"],
  variable: "--font-admin-body",
  display: "swap",
});
const franchiseeDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-admin-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Franchisee | Sud Italia",
  robots: "noindex, nofollow",
};

export default function FranchiseeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `id="admin-portal-root"` is required, not cosmetic — it's the scope where
    // `--font-ui` / `--font-display` re-resolve from the `--font-admin-*`
    // next/font vars on this element, so the bundled Inter / Fraunces actually
    // load (without it `.admin-bg` falls back to a generic font stack). Also
    // the portal mount (rule #4). See themes/admin/index.css.
    <div id="admin-portal-root" className={`${franchiseeBody.variable} ${franchiseeDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
