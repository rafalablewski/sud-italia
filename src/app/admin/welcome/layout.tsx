import "./welcome.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";

/**
 * Welcome / Morning Brief — a full-bleed CEO catch-up surface that lives under
 * /admin but renders OUTSIDE the AdminShell (no sidebar, no nav), like the
 * admin login door. This layout pulls the three brief typefaces directly onto
 * `.wb-root`; the brief's own warm-dark aesthetic lives in `welcome.css`
 * (self-contained, `wb-`-prefixed — it does not touch the av3 theme).
 */
const sans = Inter({ subsets: ["latin"], variable: "--wb-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--wb-mono", display: "swap" });
const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--wb-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Morning Brief | Sud Italia",
  robots: "noindex, nofollow",
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${mono.variable} ${serif.variable} wb-root`}>{children}</div>;
}
