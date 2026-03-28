import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { getActiveLocations } from "@/data/locations";
import { MapPin } from "lucide-react";

export function CTASection() {
  const locations = getActiveLocations();

  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-italia-red to-italia-red-dark relative overflow-hidden">
      {/* Decorative */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-italia-gold blur-3xl" />
      </div>

      <Container className="relative z-10 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-white mb-4">
          Hungry? Order Now!
        </h2>
        <p className="text-white/80 text-lg max-w-xl mx-auto mb-10">
          Skip the queue — order online and pick up your meal fresh from our
          food truck. Fast, easy, and delicious.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {locations.map((loc) => (
            <Link key={loc.slug} href={`/locations/${loc.slug}`}>
              <Button
                variant="outline"
                size="lg"
                className="border-white text-white hover:bg-white hover:text-italia-red min-w-[200px]"
              >
                <MapPin className="mr-2 h-5 w-5" />
                Order in {loc.city}
              </Button>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
