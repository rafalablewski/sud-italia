import type { Metadata, Viewport } from "next";

/**
 * Two installable apps, one codebase.
 *
 * The whole platform ships as TWO home-screen PWAs that install side by side:
 *
 *   • Ottaviano    — the customer app (storefront ordering + loyalty card).
 *                    Served by the root layout; start_url `/`.
 *   • OttavianoKDS — the operator app (full Admin + Core / KDS / POS).
 *                    Served by the admin, core, kitchen and /operator layouts.
 *
 * iOS "Add to Home Screen" keys the installed app off the manifest, the
 * `apple-mobile-web-app-title` and the apple-touch-icon present on the page
 * being installed — NOT off scope/id. So the trick is purely per-route
 * metadata: customer routes advertise the Ottaviano manifest + title, operator
 * routes advertise the OttavianoKDS manifest + title. A child layout's metadata
 * overrides the root's, so spreading `kdsAppMetadata` into an operator layout's
 * `metadata` flips that whole subtree to the KDS identity.
 *
 * Keep these fragments as the single source of truth — never inline a manifest
 * path or apple title in a layout.
 */

const VIEWPORT_FIT: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover unlocks env(safe-area-inset-*) on notched phones/tablets.
  viewportFit: "cover",
};

/** Customer app (Ottaviano). Applied by the root layout → covers the storefront. */
export const ottavianoAppMetadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ottaviano",
  },
  icons: {
    icon: "/icons/ottaviano/icon-192.png",
    apple: "/icons/ottaviano/apple-touch-180.png",
  },
};

export const ottavianoAppViewport: Viewport = {
  ...VIEWPORT_FIT,
  themeColor: "#C8102E",
};

/** Operator app (OttavianoKDS). Spread into admin / core / kitchen / operator
 *  layouts so installing from any of those surfaces yields the KDS app. */
export const kdsAppMetadata: Metadata = {
  manifest: "/ottaviano-kds.webmanifest",
  applicationName: "OttavianoKDS",
  appleWebApp: {
    capable: true,
    // Dark Core theme reaches the very top — let content paint under the status bar.
    statusBarStyle: "black-translucent",
    title: "OttavianoKDS",
  },
  icons: {
    icon: "/icons/kds/icon-192.png",
    apple: "/icons/kds/apple-touch-180.png",
  },
};

export const kdsAppViewport: Viewport = {
  ...VIEWPORT_FIT,
  themeColor: "#11161F",
};
