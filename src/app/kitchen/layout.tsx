import "../themes/admin/index.css";
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
  title: "Kitchen | Sud Italia",
  robots: "noindex, nofollow",
};

export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${kitchenBody.variable} ${kitchenDisplay.variable} admin-bg`}>
      {children}
    </div>
  );
}
