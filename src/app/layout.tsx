import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

// Fonts are loaded by each route-group layout, not here — so a homepage
// font change can't move admin and vice versa. See the per-theme
// "Today vs target" table in docs/design-system/README.md. Routes that
// don't live under a themed group (e.g. /franchisee) get system-ui
// fallback unless they declare their own layout that loads fonts.

export const viewport: Viewport = {
  // viewport-fit=cover unlocks env(safe-area-inset-*) on notched phones —
  // the mobile admin's topbar + bottom-nav rely on it to clear the notch
  // and home indicator.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | Authentic Italian Restaurant in Poland`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Italian restaurant",
    "Neapolitan pizza",
    "Italian restaurant Poland",
    "Italian dining",
    "Ottaviano",
    "pizza Kraków",
    "pizza Warszawa",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  openGraph: {
    type: "website",
    locale: "pl_PL",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Authentic Neapolitan Pizza in Poland`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Authentic Neapolitan Pizza`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
