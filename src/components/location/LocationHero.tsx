import { Location } from "@/data/types";
import { Container } from "@/components/ui/Container";
import { MapPin, Clock } from "lucide-react";

interface LocationHeroProps {
  location: Location;
}

export function LocationHero({ location }: LocationHeroProps) {
  return (
    <section className="relative bg-gradient-to-br from-italia-dark via-[#2a1a0a] to-italia-dark py-10 md:py-24">
      {/* Decorative */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 right-20 w-72 h-72 rounded-full bg-italia-red blur-3xl" />
        <div className="absolute bottom-10 left-20 w-48 h-48 rounded-full bg-italia-gold blur-3xl" />
      </div>

      {/* Italian flag accent */}
      <div className="absolute top-0 left-0 right-0 h-1 flex">
        <div className="flex-1 bg-italia-green" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-italia-red" />
      </div>

      <Container className="relative z-10">
        <p className="text-italia-gold font-medium text-sm tracking-[0.15em] uppercase mb-4">
          {location.city}
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold text-white mb-6">
          {location.name}
        </h1>
        <p className="hidden md:block text-gray-300 text-lg max-w-2xl leading-relaxed mb-8">
          {location.description}
        </p>

        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex items-center gap-2 text-gray-300">
            <MapPin className="h-5 w-5 text-italia-red" />
            <span>{location.address}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <Clock className="h-5 w-5 text-italia-green" />
            <div className="flex gap-3">
              {location.hours.map((h, i) => (
                <span key={i}>
                  {h.day}: {h.open}-{h.close}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
