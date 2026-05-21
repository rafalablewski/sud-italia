import Link from "next/link";
import { Bi } from "./Bi";
import { locations } from "@/data/locations";
import { NotifyMeForm } from "../NotifyMeForm";

function WoodFiredOven() {
  return (
    <svg width="220" height="140" viewBox="0 0 220 140" fill="none" aria-hidden="true">
      <path d="M10 122 L210 122" stroke="#B85C38" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="48" y="92" width="124" height="22" rx="3" stroke="#7A2B2B" strokeWidth="1.8" fill="#E8D6B5" />
      <path d="M48 92 C 48 60, 80 38, 110 38 C 140 38, 172 60, 172 92 Z" stroke="#7A2B2B" strokeWidth="1.8" fill="#F2E2C2" />
      <path d="M62 88 L66 78 M76 86 L80 76 M90 84 L94 74 M124 84 L128 74 M140 86 L144 76 M154 88 L158 78" stroke="#7A2B2B" strokeWidth="1" opacity="0.4" strokeLinecap="round" />
      <path d="M82 92 C 82 76, 96 66, 110 66 C 124 66, 138 76, 138 92 Z" stroke="#3D2817" strokeWidth="1.6" fill="#3D2817" />
      <path d="M96 88 C 100 80, 104 84, 108 78 C 112 84, 116 80, 120 88" stroke="#CD212A" strokeWidth="1.8" fill="#CD212A" fillOpacity="0.3" strokeLinejoin="round" />
      <path d="M102 86 C 105 81, 108 84, 111 79 C 114 84, 117 81, 120 86" stroke="#C9A23E" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <rect x="100" y="22" width="14" height="20" stroke="#7A2B2B" strokeWidth="1.6" fill="#B85C38" fillOpacity="0.2" />
      <path d="M107 18 C 110 12, 105 6, 110 0" stroke="#8C6F4F" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M178 110 L208 88" stroke="#3D2817" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="174" y="98" width="20" height="14" rx="2" transform="rotate(-30 184 105)" stroke="#3D2817" strokeWidth="1.6" fill="#E8D6B5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 18 C 6 12, 3 9, 3 6 A 7 7 0 0 1 17 6 C 17 9, 14 12, 10 18 Z" stroke="currentColor" strokeWidth="1.5" fill="rgba(184,92,56,0.12)" />
      <circle cx="10" cy="6.5" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M10 6 L10 10 L13 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function isOpenNow(hours: { day: string; open: string; close: string }[]): boolean {
  const now = new Date();
  const day = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  const todayKey =
    day === 0 ? "sun" : day >= 1 && day <= 4 ? "mon-thu" : day === 5 || day === 6 ? "fri-sat" : "";
  const range = hours.find((h) => h.day.toLowerCase().replace(/\s/g, "") === todayKey);
  if (!range) return false;
  const [oh, om] = range.open.split(":").map(Number);
  const [ch, cm] = range.close.split(":").map(Number);
  return minute >= oh * 60 + om && minute <= ch * 60 + cm;
}

function formatHours(hours: { day: string; open: string; close: string }[]): string {
  return hours.map((h) => `${h.day} ${h.open}–${h.close}`).join(" · ");
}

export function LocationsGrid() {
  return (
    <section id="locations" className="v8-section v8-alt">
      <div className="v8-inner">
        <div className="v8-section-head">
          <div className="v8-eyebrow">
            <Bi en="The trucks" pl="Nasze lokale" /> · <span className="v8-it">le botteghe</span>
          </div>
          <h2 className="v8-title">
            <Bi en="Two addresses," pl="Dwa adresy," /> <span className="v8-it">one family</span>
          </h2>
          <p className="v8-sub">
            <Bi
              en="Two trucks, one kitchen, one nonna who taught us the dough."
              pl="Dwa lokale, jedna kuchnia, jedna nonna, która nauczyła nas ciasta."
            />
          </p>
        </div>

        <div className="v8-locs">
          {locations.map((loc) => {
            const open = loc.isActive && isOpenNow(loc.hours);
            return (
              <article key={loc.slug} className="v8-loc-card">
                <div className="v8-loc-illus">
                  <WoodFiredOven />
                </div>
                <div className="v8-tricolore" />
                <div className="v8-loc-body">
                  <div className="v8-loc-head">
                    <div className="v8-loc-name">{loc.city}</div>
                    {loc.isActive ? (
                      <span className={`v8-loc-status${open ? "" : " closed"}`}>
                        <span
                          className={`v8-pulse-dot${open ? "" : " terra"}`}
                          aria-hidden="true"
                        />
                        {open ? (
                          <>
                            <Bi en="Open now" pl="Otwarte teraz" />{" "}
                            <span className="v8-it">· aperto ora</span>
                          </>
                        ) : (
                          <>
                            <Bi en="Closed" pl="Zamknięte" />{" "}
                            <span className="v8-it">· chiuso</span>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="v8-loc-status closed">
                        <Bi en="Coming soon" pl="Wkrótce" />{" "}
                        <span className="v8-it">· prossimamente</span>
                      </span>
                    )}
                  </div>

                  <div className="v8-loc-info">
                    <div className="v8-loc-info-row">
                      <PinIcon />
                      <div>{loc.address}</div>
                    </div>
                    <div className="v8-loc-info-row">
                      <ClockIcon />
                      <div>{formatHours(loc.hours)}</div>
                    </div>
                  </div>

                  <p className="v8-loc-desc">{loc.shortDescription}</p>

                  {loc.isActive ? (
                    <Link href={`/locations/${loc.slug}`} className="v8-loc-cta">
                      <Bi en="View menu & order" pl="Przejrzyj menu i zamów" />{" "}
                      <span className="v8-it v8-cta-it">· vedi menu e ordina</span>{" "}
                      <span aria-hidden="true">→</span>
                    </Link>
                  ) : (
                    <div style={{ marginTop: "auto" }}>
                      <p
                        style={{
                          fontFamily: "var(--v8-display)",
                          fontStyle: "italic",
                          fontSize: 13,
                          color: "var(--muted)",
                          textAlign: "center",
                          marginBottom: 8,
                        }}
                      >
                        <Bi en="Get notified when we open" pl="Powiadom mnie po otwarciu" />
                      </p>
                      <NotifyMeForm city={loc.city} />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
