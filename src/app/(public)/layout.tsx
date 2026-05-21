import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { AbandonedCartWrapper } from "@/components/cart/AbandonedCartWrapper";
import { CartPresenceSync } from "@/components/cart/CartPresenceSync";
import { CustomerProvider } from "@/store/customer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CustomerProvider>
      <div className="tuscany flex min-h-screen flex-col">
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
