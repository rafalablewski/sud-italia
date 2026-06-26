import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { kdsAppMetadata, kdsAppViewport } from "@/lib/pwa";

/**
 * `/operator` — the OttavianoKDS app home (the manifest `start_url`).
 *
 * Deliberately self-contained: it does NOT pull in the Admin or Core theme
 * CSS (so it owns no theme-system surface — Rule #11 doesn't apply) and styles
 * the launcher with plain Tailwind on a dark field that matches the KDS app
 * identity. It carries the OttavianoKDS PWA metadata so the install initiated
 * from the operator home yields the KDS icon + title.
 */
const ui = Inter({ subsets: ["latin"], variable: "--font-operator", display: "swap" });

export const metadata: Metadata = {
  title: "OttavianoKDS",
  robots: "noindex, nofollow",
  ...kdsAppMetadata,
};

export const viewport: Viewport = kdsAppViewport;

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${ui.variable} min-h-dvh bg-[#070A0F] text-neutral-100`}
      style={{ fontFamily: "var(--font-operator), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
