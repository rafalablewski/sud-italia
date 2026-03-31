import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { locations } from "@/data/locations";
import { MapPin, Clock, ArrowRight, Pizza } from "lucide-react";
import { NotifyMeForm } from "./NotifyMeForm";

export function LocationsGrid() {
  return (
    <section id="locations" className="py-20 md:py-28 bg-white">
      <Container>
        <div className="text-center mb-14">
          <p className="text-italia-red font-medium text-sm tracking-[0.15em] uppercase mb-3">
            Our Locations
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-italia-dark">
            Find Us Near You
          </h2>
          <p className="mt-4 text-italia-gray max-w-xl mx-auto">
            Visit one of our food trucks across Poland for an authentic Italian
            dining experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {locations.map((location, index) => (
            <div
              key={location.slug}
              className="menu-item-enter"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <Card hover className="flex flex-col overflow-hidden">
                {/* Hero gradient with food icon */}
                <div className="relative h-48 bg-gradient-to-br from-italia-red/80 to-italia-gold/80 flex items-center justify-center p-5">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {/* Large food icon as visual placeholder */}
                  <Pizza className="h-20 w-20 text-white/20 absolute top-6 right-6" />
                  <div className="relative z-10 w-full flex items-end h-full">
                    <div>
                      <h3 className="text-2xl font-heading font-bold text-white">
                        {location.city}
                      </h3>
                      {location.isActive ? (
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-green-300 text-xs font-semibold uppercase tracking-wide">
                            Open now
                          </span>
                        </div>
                      ) : (
                        <Badge variant="gold" className="mt-2">
                          Coming Soon
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <CardContent className="flex-1 flex flex-col">
                  <div className="flex items-start gap-2 text-sm text-italia-gray mb-3">
                    <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5 text-italia-red" />
                    <span>{location.address}</span>
                  </div>

                  <div className="flex items-start gap-2 text-sm text-italia-gray mb-4">
                    <Clock className="h-4 w-4 flex-shrink-0 mt-0.5 text-italia-green" />
                    <div>
                      {location.hours.map((h, i) => (
                        <span key={i}>
                          {h.day}: {h.open}-{h.close}
                          {i < location.hours.length - 1 && " | "}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-italia-gray leading-relaxed mb-5 flex-1">
                    {location.shortDescription}
                  </p>

                  {location.isActive ? (
                    <Link href={`/locations/${location.slug}`}>
                      <Button className="w-full group min-h-[48px]">
                        View Menu & Order
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </Link>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-italia-gray text-center">Get notified when we open</p>
                      <NotifyMeForm city={location.city} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
