import { getActiveLocations } from "@/data/locations";
import { getMenuWithOverrides } from "@/data/menus";
import { getPaymentSettings } from "@/lib/store";
import type { Metadata } from "next";
import { QrOrder } from "@/components/qr/QrOrder";

export const metadata: Metadata = {
  title: "Order at your table | Ottaviano",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ location?: string; table?: string }>;
};

/**
 * In-restaurant QR ordering. A guest scans the QR on their table and lands
 * here at /qr?location=<slug>&table=<n>. The page loads the location's real
 * menu + the operator's enabled payment methods and hands them to the
 * client. Checkout posts to /api/checkout with channel "qr" — an immediate
 * dine-in order (no slot) seated at the scanned table.
 *
 * (With a real domain this lives at qr.<domain>; the /qr slug is the same
 * surface until that subdomain is wired.)
 */
export default async function QrPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const active = getActiveLocations();
  const location =
    active.find((l) => l.slug === (sp.location ?? "").toLowerCase()) ?? active[0] ?? null;

  if (!location) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#1a1714", color: "#f4f5f0", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Ottaviano</h1>
          <p style={{ opacity: 0.7 }}>No location is open for ordering right now. Please ask a member of staff.</p>
        </div>
      </main>
    );
  }

  const table = (sp.table ?? "").trim().slice(0, 40);
  const [menu, payment] = await Promise.all([getMenuWithOverrides(location.slug), getPaymentSettings()]);
  // Dine-in board: only available, non-delivery-exclusive items.
  const items = menu
    .filter((i) => i.available && !i.deliveryOnly)
    .map((i) => ({ id: i.id, name: i.name, description: i.description, price: i.price, category: i.category, tags: i.tags ?? [] }));
  const methods = payment.methods.filter((m) => m.enabled).map((m) => m.id);
  const cryptoOn = payment.methods.some((m) => m.id === "bitcoin" && m.enabled);

  return (
    <QrOrder
      locationSlug={location.slug}
      locationName={location.name}
      city={location.city}
      table={table}
      items={items}
      paymentMethods={methods}
      bitcoinAddress={cryptoOn ? payment.bitcoinAddress || "" : ""}
    />
  );
}
