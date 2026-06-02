import "../themes/admin/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";

// The Manager portal is the manager's home — a scoped overview that sits
// outside the AdminShell (the owner-only HQ dashboard lives at /admin). Like
// /franchisee, /kitchen and /login, it loads the Admin theme CSS + admin font
// stack directly and wraps the page in .admin-bg so the glass-* / admin-text
// utilities resolve. Independent next/font instances from /admin/layout so a
// manager-only type tweak wouldn't move admin.
const managerBody = Inter({
  subsets: ["latin"],
  variable: "--font-admin-body",
  display: "swap",
});
const managerDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-admin-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manager | Sud Italia",
  robots: "noindex, nofollow",
};

export default function ManagerLayout({
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
    <div id="admin-portal-root" className={`${managerBody.variable} ${managerDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
