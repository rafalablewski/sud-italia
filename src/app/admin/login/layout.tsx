import "../../themes/base/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";

/**
 * Admin (owner) login — shell-less. Lives under /admin but renders outside any
 * AdminShell (v2 is deleted), so this layout pulls in the shared base CSS +
 * admin fonts directly on #admin-portal-root, exactly like the universal
 * /login door. The page itself is just <LoginForm portal="admin" />.
 */
const body = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const displayFont = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });

export const metadata: Metadata = {
  title: "Admin sign in | Sud Italia",
  robots: "noindex, nofollow",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="admin-portal-root" className={`${body.variable} ${displayFont.variable} admin-bg`}>
      {children}
    </div>
  );
}
