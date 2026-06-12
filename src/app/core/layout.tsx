import "../themes/core/index.css";
import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { CurrencyGuard } from "@/shared/CurrencyGuard";
import { CoreProviders } from "./CoreProviders";

/**
 * Core v2 (`/core/*`) — the clean-room rebuild of the Core operating system.
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
  title: "Core v2 | Ottaviano",
  robots: "noindex, nofollow",
};

const themeBoot = `(function(){try{var t=localStorage.getItem('core-theme');if(t==='light'||t==='dark'){var el=document.currentScript&&document.currentScript.parentElement;if(el)el.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function CoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="admin-portal-root"
      data-theme="dark"
      className={`core ${cvUi.variable} ${cvDisplay.variable} ${cvMono.variable}`}
    >
      <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      <CurrencyGuard />
      <CoreProviders>{children}</CoreProviders>
    </div>
  );
}
