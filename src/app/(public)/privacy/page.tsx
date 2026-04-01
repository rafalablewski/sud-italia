import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${SITE_NAME} handles your data, including optional kitchen cart visibility.`,
};

export default function PrivacyPage() {
  return (
    <Container className="py-12 md:py-16 max-w-3xl">
      <h1 className="text-3xl font-heading font-bold text-italia-dark mb-6">Privacy</h1>
      <div className="prose prose-neutral max-w-none text-italia-dark/90 space-y-4 text-sm leading-relaxed">
        <p>
          This page describes how {SITE_NAME} (&quot;we&quot;) processes information when you use our website and
          order from our locations in Poland.
        </p>

        <h2 className="text-lg font-heading font-semibold text-italia-dark mt-8 mb-2">Orders and account data</h2>
        <p>
          When you place an order or use loyalty features, we process the details needed to fulfil your order and
          run our service (for example name, phone, delivery details, and order contents), in line with applicable
          law including the GDPR.
        </p>

        <h2 className="text-lg font-heading font-semibold text-italia-dark mt-8 mb-2">
          Optional: live cart activity (kitchen operations)
        </h2>
        <p>
          When enabled in our deployment, the site may send anonymised snapshots of a shopping cart in progress
          (menu item identifiers and quantities, not your name or phone) together with a random browser identifier
          stored in your device&apos;s local storage.           Our kitchen staff can see these snapshots on the internal order board for the location you are ordering
          from (including near real-time updates over a live connection), to anticipate demand. Snapshots expire after
          a short time and are not used for advertising.
        </p>
        <p>
          This feature can be turned off on our servers; it may be active by default only in development. If you
          have questions, contact us using the details in the site footer.
        </p>

        <h2 className="text-lg font-heading font-semibold text-italia-dark mt-8 mb-2">Cookies and storage</h2>
        <p>
          We use cookies and similar storage where needed for the site to work (for example session or preferences).
          Loyalty and checkout flows may set additional identifiers as described in the product. You can remove
          site data from your browser settings at any time.
        </p>

        <p className="pt-6">
          <Link href="/" className="text-italia-red font-medium hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </Container>
  );
}
