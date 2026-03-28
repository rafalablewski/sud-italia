import type { Metadata } from "next";
import "./globals.css";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
