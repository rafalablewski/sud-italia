import "../../themes/admin-v3/index.css";
import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { kdsAppMetadata, kdsAppViewport } from "@/lib/pwa";

/**
 * Admin (owner) login — shell-less, but on the live admin design (v3 "Operator
 * Terminal"). Lives under /admin yet renders outside any AdminShell, so this
 * layout pulls in the av3 stylesheet + the three admin typefaces directly on
 * `#admin-portal-root.av3-root`. The door renders the av3 **dark canonical**
 * theme (no boot script — so no `<html>` attribute mutation and thus no
 * hydration mismatch; the door is intentionally dark, pre-auth). The page
 * itself is just <LoginForm portal="admin" />.
 */
const body = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const displayFont = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Admin sign in | Ottaviano",
  robots: "noindex, nofollow",
  // The operator sign-in door is the OttavianoKDS app — install from here too.
  ...kdsAppMetadata,
};

export const viewport: Viewport = kdsAppViewport;

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return (
    // `#admin-portal-root` carries the --font-admin-* next/font vars + is the
    // trap-free portal mount (rule #4). `.av3-root` scopes the --av3-* tokens.
    <div id="admin-portal-root" className={`${body.variable} ${displayFont.variable} ${mono.variable} av3-root flex flex-col flex-1`}>
      {children}
    </div>
  );
}
