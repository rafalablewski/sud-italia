import "../themes/admin-v3/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { themeBootScriptV3 } from "@/admin-v3/theme";

// The universal team door shares the LoginForm with /admin/login, both now on
// the live admin design (v3 "Operator Terminal"). It lives outside the
// AdminShell, so — exactly like /kitchen and /franchisee — this layout pulls in
// the av3 stylesheet + the three admin typefaces directly on
// `#admin-portal-root.av3-root`, and runs the same boot script the shell uses
// so light/dark matches the rest of admin. Independent next/font instances from
// /admin/(shell)/layout so a login-only type tweak wouldn't move admin.
const loginBody = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const loginDisplay = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const loginMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Sign in | Ottaviano",
  robots: "noindex, nofollow",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    // `#admin-portal-root` carries the --font-admin-* next/font vars that av3's
    // --av3-ui/-display/-mono read, and is the trap-free portal mount (rule #4).
    // `.av3-root` scopes the --av3-* tokens; the boot script sets the theme attr.
    <div
      id="admin-portal-root"
      className={`${loginBody.variable} ${loginDisplay.variable} ${loginMono.variable} av3-root`}
    >
      <script dangerouslySetInnerHTML={{ __html: themeBootScriptV3 }} />
      {children}
    </div>
  );
}
