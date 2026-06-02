import "../themes/admin/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";

// The universal team door is admin-themed (the shared LoginForm uses
// .admin-bg, glass-card, glass-input, glass-btn, admin-text, gradient-text),
// but it lives outside the AdminShell — so, exactly like /kitchen and
// /franchisee, this layout pulls in the Admin theme CSS + admin font stack
// directly. Without it the form renders unstyled (invisible glass-btn text),
// which is what blocked staff from signing in. Independent next/font instances
// from /admin/layout so a login-only type tweak wouldn't move admin.
const loginBody = Inter({
  subsets: ["latin"],
  variable: "--font-admin-body",
  display: "swap",
});
const loginDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-admin-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sign in | Sud Italia",
  robots: "noindex, nofollow",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${loginBody.variable} ${loginDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
