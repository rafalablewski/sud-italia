import Link from "next/link";
import { Bi } from "../Bi";
import { getActiveLocations } from "@/data/locations";
import {
  SITE_NAME,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  SOCIAL_LINKS,
} from "@/lib/constants";

function FooterBasil() {
  return (
    <svg width="32" height="32" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <path d="M19 33 C 19 27, 19 20, 19 12" stroke="#E6C97A" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M19 24 C 14 22, 11 19, 10 15 C 14 17, 17 19, 19 22"
        fill="#4A7C59"
        fillOpacity="0.3"
        stroke="#E6C97A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M19 19 C 24 17, 27 14, 28 10 C 24 12, 21 14, 19 17"
        fill="#4A7C59"
        fillOpacity="0.3"
        stroke="#E6C97A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function V8Footer() {
  const locations = getActiveLocations();
  const year = new Date().getFullYear();

  return (
    <footer className="v8-footer">
      <div className="v8-footer-inner">
        <div className="v8-footer-grid">
          <div>
            <div className="v8-footer-brand">
              <FooterBasil />
              <span>{SITE_NAME}</span>
            </div>
            <p className="v8-footer-tagline">
              <Bi
                en="Neapolitan pizza, made by hand, fired in the wood-burning oven. Two trucks. One Vesuvius."
                pl="Neapolitańska pizza, robiona ręcznie, pieczona w piecu opalanym drewnem. Dwa lokale. Jeden Wezuwiusz."
              />
            </p>
            <div className="v8-tricolore v8-footer-tricolore" />
          </div>

          <div>
            <h4>
              <Bi en="Menu" pl="Menu" />
            </h4>
            <ul>
              <li><Link href="#bundles">Bundles · <span className="v8-it">menù del giorno</span></Link></li>
              <li><Link href="#locations">Pizza · Pasta · <span className="v8-it">antipasti</span></Link></li>
              <li><Link href="#locations"><span className="v8-it">Bibite · dolci</span></Link></li>
            </ul>
          </div>

          <div>
            <h4>
              <Bi en="Locations" pl="Lokalizacje" />
            </h4>
            <ul>
              {locations.map((loc) => (
                <li key={loc.slug}>
                  <Link href={`/locations/${loc.slug}`}>
                    {loc.city} · <span className="v8-footer-addr">{loc.address}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="#famiglia">
                  <Bi en="Our story" pl="Nasza historia" /> ·{" "}
                  <span className="v8-it">la nostra storia</span>
                </Link>
              </li>
              <li>
                <Link href="#soci">
                  <Bi en="Loyalty programme" pl="Program lojalnościowy" />
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>
              <Bi en="Contact" pl="Kontakt" /> ·{" "}
              <span className="v8-it">contatti</span>
            </h4>
            <ul>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </li>
              <li>
                <a href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`} className="v8-num">
                  {CONTACT_PHONE}
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer">
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="v8-footer-bottom">
          <span>
            &copy; {year} {SITE_NAME} ·{" "}
            <span className="v8-it-em">&ldquo;Mangia bene, ridi spesso, ama molto.&rdquo;</span>
          </span>
          <span>
            <Bi en="Made with passion in Napoli" pl="Z pasją z Neapolu" /> ·{" "}
            <span className="v8-it">cucinato in Polska</span>
          </span>
          <Link href="/privacy" className="v8-footer-priv">
            <Bi en="Privacy" pl="Prywatność" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
