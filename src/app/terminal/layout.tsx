import "../themes/admin-v3/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";

// The shared-device PIN terminal is the keypad sibling of the sign-in door, so
// it now runs on the same av3 "Operator Terminal" surface as /login + /admin/login
// (see LoginForm + themes/admin-v3 §23 `.av3-auth*`). Like /kitchen and /login it
// lives outside the AdminShell, so this layout pulls in the av3 stylesheet + the
// three admin typefaces directly on `#admin-portal-root.av3-root`, and — like the
// login door — ships no theme boot script: the terminal renders the av3 **dark
// canonical** theme (pre-auth, no `<html>` mutation → no hydration mismatch).
// Independent next/font instances from /admin/(shell)/layout so a terminal-only
// type tweak wouldn't move admin.
const terminalBody = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const terminalDisplay = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const terminalMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Terminal | Ottaviano",
  robots: "noindex, nofollow",
};

export default function TerminalLayout({
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
      className={`${terminalBody.variable} ${terminalDisplay.variable} ${terminalMono.variable} av3-root flex flex-col flex-1`}
    >
      {children}
    </div>
  );
}
