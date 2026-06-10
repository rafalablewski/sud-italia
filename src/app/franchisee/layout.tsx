import "../themes/admin-v3/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";

// Franchisee portal is admin-flavoured (reads getCurrentAdminUser, role-gated to
// "franchisee" / "owner"). It lives outside the AdminShell, so — like /login,
// /terminal and /manager — this layout loads the av3 "Operator Terminal"
// stylesheet + the three admin typefaces directly on `#admin-portal-root
// .av3-root` and renders the dark canonical theme, so the portal home matches
// the sign-in door. Independent next/font instances so a franchisee-only type
// tweak would not move /admin.
const franchiseeBody = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const franchiseeDisplay = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const franchiseeMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Franchisee | Ottaviano",
  robots: "noindex, nofollow",
};

export default function FranchiseeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `#admin-portal-root` carries the --font-admin-* next/font vars that av3's
    // --av3-ui/-display/-mono read, and is the trap-free portal mount (rule #4).
    // `.av3-root` scopes the --av3-* tokens (renders dark canonical by default).
    <div
      id="admin-portal-root"
      className={`${franchiseeBody.variable} ${franchiseeDisplay.variable} ${franchiseeMono.variable} av3-root flex flex-col flex-1`}
    >
      {children}
    </div>
  );
}
