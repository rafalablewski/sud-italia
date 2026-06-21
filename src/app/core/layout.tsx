import "../themes/core/index.css";
import "../themes/core/skins/solare.css";
import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { CurrencyGuard } from "@/shared/CurrencyGuard";
import { getThemeSkinSettings } from "@/lib/store";
import { CoreProviders } from "./CoreProviders";

/**
 * Core (`/core/*`) — the clean-room rebuild of the Core operating system.
 *
 * A SEPARATE entity from /admin AND from the current /core: this layout loads
 * ONLY the core theme (no admin base, no suite.css) and its OWN next/font
 * instances (no `--font-admin-*`). Everything is scoped under `.core`. The
 * `#admin-portal-root` mount + PLN currency pin are kept as infra (shared
 * overlays target the portal; the truck only ever bills in złoty). Theme is
 * dark-by-default; a pre-paint script applies the saved light/dark choice.
 *
 * See docs/design-system/core/.
 */
const cvUi = Inter({ subsets: ["latin"], variable: "--font-core-ui", display: "swap" });
const cvDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-core-display",
  display: "swap",
});
const cvMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-core-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Core | Ottaviano",
  robots: "noindex, nofollow",
};

// The layout server-renders the DB-global active skin onto `data-skin`, so the
// surface must render per-request — otherwise a statically-prerendered /core
// page would bake the build-time skin and ignore later swaps. Core is an
// authenticated, noindex operator surface, so there's no caching benefit lost.
export const dynamic = "force-dynamic";

const themeBoot = `(function(){try{var t=localStorage.getItem('core-theme');if(t==='light'||t==='dark'){var el=document.currentScript&&document.currentScript.parentElement;if(el)el.setAttribute('data-theme',t);}}catch(e){}})();`;

export default async function CoreLayout({ children }: { children: React.ReactNode }) {
  // DB-global active Core skin → `data-skin`, so the alternate skin's CSS
  // (scoped under `.core[data-skin="…"]`) takes over. Core is already dynamic
  // (operator surface), so the server read is free and flash-free. The
  // independent `data-theme` (light/dark) boot script below still applies on
  // top — a skin sets the palette, the toggle picks its light/dark variant.
  const skins = await getThemeSkinSettings();
  // A skin can carry a preferred light/dark default. Solare is a *daylight*
  // skin, so it presents light unless the operator has explicitly toggled (the
  // boot script below still wins from localStorage 'core-theme'). Core's own
  // default stays dark (night trucks / kitchen glare).
  const defaultTheme = skins.core === "solare" ? "light" : "dark";
  return (
    <div
      id="admin-portal-root"
      data-theme={defaultTheme}
      data-skin={skins.core}
      className={`core ${cvUi.variable} ${cvDisplay.variable} ${cvMono.variable}`}
    >
      <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      <CurrencyGuard />
      <CoreProviders>{children}</CoreProviders>
    </div>
  );
}
