import "../themes/homepage/index.css";
import { Lora, Cormorant_Garamond } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { AbandonedCartWrapper } from "@/components/cart/AbandonedCartWrapper";
import { CartPresenceSync } from "@/components/cart/CartPresenceSync";
import { LayoutGate } from "@/components/layout/LayoutGate";
import { CustomerProvider } from "@/store/customer";

// Homepage fonts — owned by the Homepage theme. Loaded here (not in the
// root layout) so a weight / subset change can't drift into Admin or
// Core. The exposed CSS variables are namespaced (--font-homepage-*) so
// the storefront's Tailwind tokens (themes/homepage/tokens.css) resolve
// against THIS scope; admin routes can change their own type stack in
// admin/layout.tsx without touching storefront type.
//
// Pair: Lora (body) + Cormorant Garamond (display) — the V8 Trattoria
// editorial serif duo, matching the mockup at public/mockups/cart.html.
const homepageBody = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-homepage-body",
  display: "swap",
});
const homepageHeading = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-homepage-heading",
  display: "swap",
});

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CustomerProvider>
      <div className={`${homepageBody.variable} ${homepageHeading.variable} flex flex-col flex-1`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <LayoutGate flag="showChatWidget">
          <ChatWidget />
        </LayoutGate>
        <AbandonedCartWrapper />
        <CartPresenceSync />
      </div>
    </CustomerProvider>
  );
}
