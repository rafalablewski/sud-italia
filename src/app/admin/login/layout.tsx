import "../../themes/admin-v3/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { themeBootScriptV3 } from "@/admin-v3/theme";

/**
 * Admin (owner) login — shell-less, but on the live admin design (v3 "Operator
 * Terminal"). Lives under /admin yet renders outside any AdminShell, so this
 * layout pulls in the av3 stylesheet + the three admin typefaces directly on
 * `#admin-portal-root.av3-root`, and runs the same boot script the shell uses
 * so the theme (dark canonical / light opt-in) matches the rest of admin. The
 * page itself is just <LoginForm portal="admin" />.
 */
const body = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const displayFont = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Admin sign in | Ottaviano",
  robots: "noindex, nofollow",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return (
    // `#admin-portal-root` carries the --font-admin-* next/font vars + is the
    // trap-free portal mount (rule #4). `.av3-root` scopes the --av3-* tokens.
    <div id="admin-portal-root" className={`${body.variable} ${displayFont.variable} ${mono.variable} av3-root`}>
      <script dangerouslySetInnerHTML={{ __html: themeBootScriptV3 }} />
      {children}
    </div>
  );
}
