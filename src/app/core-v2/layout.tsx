import "../themes/core-v2/index.css";
import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { AdminCurrencyGuard } from "@/shared/AdminCurrencyGuard";
import { CoreV2Providers } from "./CoreV2Providers";

/**
 * Core v2 (`/core-v2/*`) — the clean-room rebuild of the Core operating system.
 *
 * A SEPARATE entity from /admin AND from the current /core: this layout loads
 * ONLY the core-v2 theme (no admin base, no suite.css) and its OWN next/font
 * instances (no `--font-admin-*`). Everything is scoped under `.cv2`. The
 * `#admin-portal-root` mount + PLN currency pin are kept as infra (shared
 * overlays target the portal; the truck only ever bills in złoty). Theme is
 * dark-by-default; a pre-paint script applies the saved light/dark choice.
 *
 * See docs/design-system/core-v2/.
 */
const cvUi = Inter({ subsets: ["latin"], variable: "--font-cv-ui", display: "swap" });
const cvDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-cv-display",
  display: "swap",
});
const cvMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-cv-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Core v2 | Sud Italia",
  robots: "noindex, nofollow",
};

const themeBoot = `(function(){try{var t=localStorage.getItem('cv2-theme');if(t==='light'||t==='dark'){var el=document.currentScript&&document.currentScript.parentElement;if(el)el.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function CoreV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="admin-portal-root"
      data-theme="dark"
      className={`cv2 ${cvUi.variable} ${cvDisplay.variable} ${cvMono.variable}`}
    >
      <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      <AdminCurrencyGuard />
      <CoreV2Providers>{children}</CoreV2Providers>
    </div>
  );
}
