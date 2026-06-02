import "../themes/admin/index.css";
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
  title: "Terminal | Sud Italia",
  robots: "noindex, nofollow",
};

export default function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${terminalBody.variable} ${terminalDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
