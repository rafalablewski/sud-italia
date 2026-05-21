import { ChatWidget } from "@/components/chat/ChatWidget";
import { AbandonedCartWrapper } from "@/components/cart/AbandonedCartWrapper";
import { CartPresenceSync } from "@/components/cart/CartPresenceSync";
import { CustomerProvider } from "@/store/customer";

/**
 * Shared public-side providers. Header + Footer live inside the
 * (legacy)/ subgroup so the home page can render its own v8 chrome
 * without the legacy header/footer wrapping it.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CustomerProvider>
      {children}
      <ChatWidget />
      <AbandonedCartWrapper />
      <CartPresenceSync />
    </CustomerProvider>
  );
}
