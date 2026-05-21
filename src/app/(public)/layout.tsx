import { Cormorant_Garamond, Lora } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { AbandonedCartWrapper } from "@/components/cart/AbandonedCartWrapper";
import { CartPresenceSync } from "@/components/cart/CartPresenceSync";
import { CustomerProvider } from "@/store/customer";

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
});

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CustomerProvider>
      <div className={`tuscany ${cormorant.variable} ${lora.variable} flex min-h-screen flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <ChatWidget />
        <AbandonedCartWrapper />
        <CartPresenceSync />
      </div>
    </CustomerProvider>
  );
}
