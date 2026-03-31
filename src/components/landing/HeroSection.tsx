import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ChevronDown, MapPin, Clock } from "lucide-react";
import { getActiveLocations } from "@/data/locations";

export function HeroSection() {
  const locations = getActiveLocations();

  return (
    <section className="relative min-h-[60vh] md:min-h-[90vh] flex items-center bg-gradient-to-br from-italia-dark via-[#2a1a0a] to-italia-dark overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-italia-red blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-italia-gold blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-italia-green blur-3xl opacity-50" />
      </div>

      {/* Italian flag accent stripe */}
      <div className="absolute top-0 left-0 right-0 h-1 flex">
        <div className="flex-1 bg-italia-green" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-italia-red" />
      </div>

      <Container className="relative z-10 py-20">
        <div className="max-w-3xl">
          <p className="text-italia-gold font-medium text-sm tracking-[0.2em] uppercase mb-6 stagger-1">
            Neapolitan Pizza Food Trucks
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-heading font-bold text-white leading-[1.1] mb-6 stagger-2">
            Order{" "}
            <span className="text-italia-red">Authentic Pizza</span>
            <br />
            Ready in{" "}
            <span className="text-italia-green">15 Minutes</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 leading-relaxed mb-10 max-w-xl stagger-3">
            Order online from our food trucks in Kraków and Warsaw.
            Neapolitan pizza, fresh pasta, and Italian street food —
            ready in 15 minutes.
          </p>

          {/* Quick location picker (Uber/Grab style) */}
          <div className="stagger-4">
            {/* Desktop: horizontal buttons */}
            <div className="hidden sm:flex gap-3">
              {locations.map((loc) => (
                <Link key={loc.slug} href={`/locations/${loc.slug}`}>
                  <Button
                    size="lg"
                    className="group"
                  >
                    <MapPin className="h-5 w-5 mr-2" />
                    Order in {loc.city}
                  </Button>
                </Link>
              ))}
              <Link href="#about">
                <Button variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10 hover:text-white">
                  Our Story
                </Button>
              </Link>
            </div>

            {/* Mobile: prominent location cards (Grab-style) */}
            <div className="sm:hidden space-y-3">
              <p className="text-white/70 text-sm font-medium mb-2">
                Where would you like to order from?
              </p>
              {locations.map((loc) => (
                <Link
                  key={loc.slug}
                  href={`/locations/${loc.slug}`}
                  className="flex items-center gap-4 p-4 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl hover:bg-white/15 transition-all active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-xl bg-italia-red/20 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-6 w-6 text-italia-red" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-base">
                      {loc.name}
                    </h3>
                    <p className="text-white/60 text-sm truncate">{loc.address}</p>
                  </div>
                  <div className="flex items-center gap-1 text-italia-green text-xs font-medium flex-shrink-0">
                    <Clock className="h-3 w-3" />
                    Open
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Container>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce hidden md:block">
        <ChevronDown className="h-8 w-8 text-white/50" />
      </div>
    </section>
  );
}
