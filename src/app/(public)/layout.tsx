import "../themes/homepage/index.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { AbandonedCartWrapper } from "@/components/cart/AbandonedCartWrapper";
import { CartPresenceSync } from "@/components/cart/CartPresenceSync";
import { LayoutGate } from "@/components/layout/LayoutGate";
import { CustomerProvider } from "@/store/customer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CustomerProvider>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <LayoutGate flag="showChatWidget">
        <ChatWidget />
      </LayoutGate>
      <AbandonedCartWrapper />
      <CartPresenceSync />
    </CustomerProvider>
  );
}
