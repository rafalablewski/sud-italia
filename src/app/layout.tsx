import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

// UI workhorse — every operational surface (POS, KDS, tables, forms) reads
// this. Variable font, self-hosted at build time.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Display face — reserved for the wordmark, hero headings and large numerals.
// A high-contrast optical serif gives the suite its hospitality "soul"; it is
// never applied to dense operational text.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

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
    <html lang="pl" className={`h-full ${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-full flex flex-col antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
