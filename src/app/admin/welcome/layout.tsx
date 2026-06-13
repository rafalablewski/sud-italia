import "../../themes/admin-v3/index.css";
import "./welcome.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { SITE_NAME } from "@/lib/constants";

/**
 * Welcome / Morning Brief — a full-bleed CEO catch-up surface that lives under
 * /admin but renders OUTSIDE the AdminShell (no sidebar, no nav), like the
 * admin login door. It runs on the live admin design system (av3 "Operator
 * Terminal"): this layout pulls the av3 stylesheet + the three admin typefaces
 * onto `#admin-portal-root.av3-root`, so the brief shares every `--av3-*` token
 * and component (Monogram, MetricExplainer, Dialog) with the rest of admin —
 * no parallel palette. `#admin-portal-root` is also the trap-free portal mount
 * (Rule #4). Dark canonical, no boot script (pre-shell, so no hydration
 * mismatch). The brief's page-specific layout lives in `welcome.css`.
 */
const body = Inter({ subsets: ["latin"], variable: "--font-admin-body", display: "swap" });
const displayFont = Fraunces({ subsets: ["latin"], variable: "--font-admin-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-admin-mono", display: "swap" });

export const metadata: Metadata = {
  title: `Morning Brief | ${SITE_NAME}`,
  robots: "noindex, nofollow",
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="admin-portal-root" className={`${body.variable} ${displayFont.variable} ${mono.variable} av3-root flex flex-col flex-1`}>
      {children}
    </div>
  );
}
