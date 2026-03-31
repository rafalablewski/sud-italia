import Link from "next/link";
import { Container } from "@/components/ui/Container";

export default function NotFound() {
  return (
    <section className="py-20 md:py-32">
      <Container>
        <div className="max-w-md mx-auto text-center">
          <div className="text-6xl mb-6">🍕</div>
          <h1 className="text-3xl font-heading font-bold text-italia-dark mb-3">
            Page not found
          </h1>
          <p className="text-italia-gray mb-8">
            Looks like this page got lost on the way from Naples.
            Let&apos;s get you back to the menu.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="px-6 py-3 bg-italia-red text-white font-semibold rounded-xl hover:bg-italia-red-dark transition-colors text-sm"
            >
              Back to Home
            </Link>
            <Link
              href="/locations/krakow"
              className="px-6 py-3 border border-gray-200 text-italia-dark font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              View Menu
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
