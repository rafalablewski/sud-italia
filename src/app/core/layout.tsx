import "../themes/core/index.css";
import "../themes/core/skins/liquid-glass.css";
// Per-surface dense-console 1:1 parity layers — imported AFTER the base + skin
// so each can override; every rule is scoped under `.core`. One file per surface
// keeps them conflict-free (see docs/design-system/core/redesign/PARITY-AUDIT.md).
import "../themes/core/parity/crm.css";
import "../themes/core/parity/inbox.css";
import "../themes/core/parity/loyalty.css";
import "../themes/core/parity/concierge.css";
import "../themes/core/parity/floor.css";
import "../themes/core/parity/slots.css";
import "../themes/core/parity/dispatch.css";
import "../themes/core/parity/orders.css";
import "../themes/core/parity/book.css";
import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { kdsAppMetadata, kdsAppViewport } from "@/lib/pwa";
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
  // Core is the heart of the OttavianoKDS operator app (POS / KDS / Orders).
  ...kdsAppMetadata,
};

export const viewport: Viewport = kdsAppViewport;

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
  // Core's default is dark (night trucks / kitchen glare). A future skin that
  // wants a light default can compute `data-theme` from `skins.core` here;
  // CoreThemeToggle already adopts whatever the server renders.
  return (
    <div
      id="admin-portal-root"
      data-theme="dark"
      data-skin={skins.core}
      className={`core ${cvUi.variable} ${cvDisplay.variable} ${cvMono.variable}`}
    >
      <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      <CurrencyGuard />
      <CoreProviders>{children}</CoreProviders>
    </div>
  );
}
