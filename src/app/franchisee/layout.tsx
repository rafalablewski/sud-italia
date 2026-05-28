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
    <div className={`${franchiseeBody.variable} ${franchiseeDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
