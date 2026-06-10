import "../themes/admin-v3/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";

// The Manager portal is the manager's home — a scoped overview that sits
// outside the AdminShell (the owner-only HQ dashboard lives at /admin). Like
// /login, /terminal and /franchisee, it loads the av3 "Operator Terminal"
// stylesheet + the three admin typefaces directly on `#admin-portal-root
// .av3-root` and renders the **dark canonical** theme (no boot script — no
// `<html>` mutation, so no hydration mismatch), so the portal home matches the
// sign-in door it follows. Independent next/font instances from /admin/(shell)
// so a manager-only type tweak wouldn't move admin.
const managerBody = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const managerDisplay = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const managerMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Manager | Ottaviano",
  robots: "noindex, nofollow",
};

export default function ManagerLayout({
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
      className={`${managerBody.variable} ${managerDisplay.variable} ${managerMono.variable} av3-root flex flex-col flex-1`}
    >
      {children}
    </div>
  );
}
