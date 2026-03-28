import { Location } from "@/data/types";
import { Container } from "@/components/ui/Container";
import { MapPin, Clock, Navigation } from "lucide-react";

interface LocationInfoProps {
  location: Location;
}

export function LocationInfo({ location }: LocationInfoProps) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${location.coordinates.lat},${location.coordinates.lng}`;

  return (
    <section className="py-10 md:py-16 bg-white border-t border-gray-100">
      <Container>
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-heading font-bold text-italia-dark mb-6 text-center">
            Visit Us
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Address + Directions */}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-4 rounded-2xl border border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[64px]"
            >
              <div className="w-10 h-10 rounded-xl bg-italia-red/10 flex items-center justify-center flex-shrink-0">
                <Navigation className="h-5 w-5 text-italia-red" />
              </div>
              <div>
                <h3 className="font-semibold text-italia-dark text-base">Get Directions</h3>
                <p className="text-sm text-italia-gray mt-0.5">{location.address}</p>
              </div>
            </a>

            {/* Hours */}
            <div className="flex gap-3 p-4 rounded-2xl border border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-italia-green/10 flex items-center justify-center flex-shrink-0">
                <Clock className="h-5 w-5 text-italia-green" />
              </div>
              <div>
                <h3 className="font-semibold text-italia-dark text-base">
                  Hours
                </h3>
                <div className="space-y-0.5 mt-0.5">
                  {location.hours.map((h, i) => (
                    <p key={i} className="text-sm text-italia-gray">
                      <span className="font-medium text-italia-dark">
                        {h.day}:
                      </span>{" "}
                      {h.open} - {h.close}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
