import { Location } from "@/data/types";
import { Container } from "@/components/ui/Container";
import { MapPin, Clock, Navigation } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface LocationInfoProps {
  location: Location;
}

export function LocationInfo({ location }: LocationInfoProps) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${location.coordinates.lat},${location.coordinates.lng}`;

  return (
    <section className="py-16 bg-white border-t border-gray-100">
      <Container>
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-heading font-bold text-italia-dark mb-8 text-center">
            Visit Us
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Address */}
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-italia-red/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-italia-red" />
              </div>
              <div>
                <h3 className="font-semibold text-italia-dark mb-1">Address</h3>
                <p className="text-sm text-italia-gray">{location.address}</p>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-italia-red hover:underline mt-2"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Get directions
                </a>
              </div>
            </div>

            {/* Hours */}
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-italia-green/10 flex items-center justify-center flex-shrink-0">
                <Clock className="h-5 w-5 text-italia-green" />
              </div>
              <div>
                <h3 className="font-semibold text-italia-dark mb-1">
                  Opening Hours
                </h3>
                <div className="space-y-1">
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

          {/* Map placeholder */}
          <div className="mt-10 rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 h-64 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="h-8 w-8 text-italia-gray/40 mx-auto mb-2" />
              <p className="text-sm text-italia-gray">
                {location.address}
              </p>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="mt-3">
                  Open in Google Maps
                </Button>
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
