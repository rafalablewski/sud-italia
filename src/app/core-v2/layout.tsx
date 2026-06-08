import "./styles/core.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { AdminLocationProvider } from "@/shared/LocationContext";
import { AdminCurrencyGuard } from "@/shared/AdminCurrencyGuard";
import { ToastProvider } from "@/ui/Toast";

/**
 * Core v2 (`/core-v2/*`) — the rebuilt operational suite (POS · KDS · Guest ·
 * Service) on the core-suite mockup design. It is a SEPARATE ENTITY: this
 * layout loads ONLY Core v2's own self-contained theme (`styles/core.css`,
 * scoped under `.corev2`) and its own fonts — it does NOT import the Admin or
 * Homepage themes, and changes here cannot move them.
 *
 * The data/behaviour providers (location context, the PLN currency pin, the
 * toast portal) are shared infrastructure, not styling, so they are reused to
 * keep every surface wired to the real data layer.
 */

const ui = Inter({ subsets: ["latin"], variable: "--cv2-ui", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--cv2-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--cv2-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Core v2 | Sud Italia",
  robots: "noindex, nofollow",
};

export default function CoreV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${ui.variable} ${display.variable} ${mono.variable} flex flex-col flex-1`}>
      <AdminCurrencyGuard />
      <AdminLocationProvider>
        <ToastProvider>{children}</ToastProvider>
      </AdminLocationProvider>
    </div>
  );
}
