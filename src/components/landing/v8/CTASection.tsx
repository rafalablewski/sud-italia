import Link from "next/link";
import { Bi } from "./Bi";
import { getActiveLocations } from "@/data/locations";

export function CTASection() {
  const locations = getActiveLocations();

  return (
    <section className="v8-section v8-closing">
      <div className="v8-inner">
        <h2 className="v8-closing-title">
          <Bi en="Hungry?" pl="Głodny?" />{" "}
          <span className="v8-it">Andiamo.</span>
        </h2>
        <p className="v8-closing-sub">
          <Bi
            en="Order online. Pick it up hot from the oven. No queue, no fuss."
            pl="Zamów online. Odbierz prosto z pieca. Bez kolejek, bez stresu."
          />
        </p>

        <div className="v8-closing-ctas">
          {locations.map((loc) => (
            <Link key={loc.slug} href={`/locations/${loc.slug}`} className="v8-cta">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 18 C 6 12, 3 9, 3 6 A 7 7 0 0 1 17 6 C 17 9, 14 12, 10 18 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(244,245,240,0.15)" />
                <circle cx="10" cy="6.5" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <span>
                <Bi en={`Order in ${loc.city}`} pl={`Zamów w ${loc.city}`} />{" "}
                <span className="v8-it v8-cta-it">· Ordina a {loc.city}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
