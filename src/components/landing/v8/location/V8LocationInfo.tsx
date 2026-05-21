import { Location } from "@/data/types";
import { Bi } from "../Bi";
import { CONTACT_PHONE } from "@/lib/constants";

interface V8LocationInfoProps {
  location: Location;
}

function FlameIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22 C 7 22, 4 18, 4 14 C 4 11, 6 8, 8 6 C 8 9, 10 10, 12 8 C 12 5, 11 3, 14 2 C 14 6, 18 8, 18 14 C 18 18, 16 22, 12 22 Z"
        stroke="#B85C38"
        strokeWidth="1.5"
        fill="#CD212A"
        fillOpacity="0.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 4 L9 4 L11 9 L8 11 C 9 14, 11 16, 14 17 L 16 14 L 21 16 L 21 20 C 12 20, 4 12, 4 5 Z"
        stroke="#B85C38"
        strokeWidth="1.5"
        fill="#B85C38"
        fillOpacity="0.12"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22 C 8 16, 4 12, 4 8 A 8 8 0 0 1 20 8 C 20 12, 16 16, 12 22 Z"
        stroke="#B85C38"
        strokeWidth="1.5"
        fill="#B85C38"
        fillOpacity="0.12"
      />
      <circle cx="12" cy="8" r="3" stroke="#B85C38" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function V8LocationInfo({ location }: V8LocationInfoProps) {
  return (
    <section className="v8-section v8-alt">
      <div className="v8-inner">
        <div className="v8-loc-cards">
          <div className="v8-loc-card-info">
            <div className="v8-loc-card-icon">
              <FlameIcon />
            </div>
            <h2 className="v8-loc-card-title">
              <Bi en="When the oven is lit" pl="Kiedy piec jest rozgrzany" />
              <span className="v8-it">· quando il forno è acceso</span>
            </h2>
            <ul className="v8-loc-hours">
              {location.hours.map((h) => (
                <li key={h.day}>
                  <span className="v8-loc-hours-day v8-it">{h.day}</span>
                  <span className="v8-loc-hours-time v8-num">
                    {h.open}–{h.close}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="v8-loc-card-info">
            <div className="v8-loc-card-icon">
              <PhoneIcon />
            </div>
            <h2 className="v8-loc-card-title">
              <Bi
                en="To speak with the kitchen"
                pl="Aby porozmawiać z kuchnią"
              />
              <span className="v8-it">· per parlare con la cucina</span>
            </h2>
            <a
              className="v8-loc-phone v8-num"
              href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`}
            >
              {CONTACT_PHONE}
            </a>
            <p className="v8-loc-card-note">
              <Bi
                en="Call ahead for groups of 6+ or special requests."
                pl="Zadzwoń wcześniej dla grup 6+ lub specjalnych życzeń."
              />{" "}
              <span className="v8-it">· per gruppi · su richiesta</span>
            </p>
          </div>

          <div className="v8-loc-card-info">
            <div className="v8-loc-card-icon">
              <MapPinIcon />
            </div>
            <h2 className="v8-loc-card-title">
              <Bi en="When you'll swing by" pl="Kiedy odbierzesz" />
              <span className="v8-it">· quando passi a prenderla</span>
            </h2>
            <address className="v8-loc-address">{location.address}</address>
            <p className="v8-loc-card-note">
              <Bi
                en="The truck is parked on the corner. Look for the basil sprig in the window."
                pl="Lokal stoi na rogu. Szukaj listka bazylii w oknie."
              />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
