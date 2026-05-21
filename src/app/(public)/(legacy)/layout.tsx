import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

/**
 * Chrome for the legacy public routes (locations, rewards, privacy,
 * order-confirmation, review). The home page intentionally lives one
 * level up so it can render its own v8 header + footer instead of
 * inheriting these.
 *
 * The CustomerProvider, ChatWidget, AbandonedCart, and CartPresenceSync
 * stay in the parent (public)/layout.tsx so every page — including the
 * home page — shares the same cart store and customer identity.
 */
export default function LegacyChromeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
