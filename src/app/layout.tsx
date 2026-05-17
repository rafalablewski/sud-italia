import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

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
    default: `${SITE_NAME} | Authentic Italian Street Food in Poland`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Italian food truck",
    "Neapolitan pizza",
    "food truck Poland",
    "Italian street food",
    "Sud Italia",
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
