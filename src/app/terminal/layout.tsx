import "../themes/base/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";

// The shared-device PIN terminal is admin-themed (it uses .admin-bg,
// glass-card, glass-input, glass-btn, admin-text, gradient-text) yet lives
// outside the AdminShell — so, like /kitchen and /franchisee, this layout
// loads the Admin theme CSS + admin font stack directly. Without it the keypad
// renders unstyled. Independent next/font instances from /admin/layout so a
// terminal-only type tweak wouldn't move admin.
const terminalBody = Inter({
  subsets: ["latin"],
  variable: "--font-admin-body",
  display: "swap",
});
const terminalDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-admin-display",
  display: "swap",
});

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
    // `id="admin-portal-root"` is required, not cosmetic — it's the scope where
    // `--font-ui` / `--font-display` re-resolve from the `--font-admin-*`
    // next/font vars on this element, so the bundled Inter / Fraunces actually
    // load (without it `.admin-bg` falls back to a generic font stack). Also
    // the portal mount (rule #4). See themes/base/index.css.
    <div id="admin-portal-root" className={`${terminalBody.variable} ${terminalDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
