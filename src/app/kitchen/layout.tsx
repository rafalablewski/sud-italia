import "../themes/base/index.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";

// Kitchen surfaces are admin-themed (they use .admin-bg, glass-card,
// font-heading, etc.) so they pull in the Admin theme CSS and font
// stack here. Independent next/font instances from /admin/layout so a
// kitchen-only font change wouldn't move admin.
const kitchenBody = Inter({
  subsets: ["latin"],
  variable: "--font-admin-body",
  display: "swap",
});
const kitchenDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-admin-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kitchen | Ottaviano",
  robots: "noindex, nofollow",
};

export default function KitchenLayout({
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
    <div id="admin-portal-root" className={`${kitchenBody.variable} ${kitchenDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
