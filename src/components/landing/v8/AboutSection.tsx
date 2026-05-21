import { Bi } from "./Bi";

function WheatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22 L12 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 14 C 7 12, 5 9, 4 5 C 8 6, 11 9, 12 12" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.2" strokeLinejoin="round" />
      <path d="M12 14 C 17 12, 19 9, 20 5 C 16 6, 13 9, 12 12" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.2" strokeLinejoin="round" />
      <path d="M12 9 C 9 7, 7 4, 7 2 C 10 3, 12 5, 12 8" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.2" strokeLinejoin="round" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="8" width="13" height="8" rx="1" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M15 11 L20 11 L22 14 L22 16 L15 16 Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <circle cx="7" cy="18" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21 C 6 16, 3 12, 3 8 A 5 5 0 0 1 12 6 A 5 5 0 0 1 21 8 C 21 12, 18 16, 12 21 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20 C 6 12, 12 6, 20 4 C 18 12, 12 18, 4 20 Z" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.18" strokeLinejoin="round" />
      <path d="M4 20 L16 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const values = [
  {
    Icon: WheatIcon,
    title: { en: "Authentic recipes", pl: "Autentyczne przepisy", it: "ricette autentiche" },
    desc: {
      en: "San Marzano DOP tomatoes, fior di latte di Agerola, and Tipo 00 flour proofed for 36 hours.",
      pl: "Pomidory San Marzano DOP, fior di latte di Agerola i mąka Tipo 00 wyrastająca 36 godzin.",
    },
  },
  {
    Icon: TruckIcon,
    title: { en: "Street food, Italian way", pl: "Street food po włosku", it: "cibo di strada" },
    desc: {
      en: "Two trucks parked where the city lives — eaten standing up, like a Neapolitan would.",
      pl: "Dwa lokale stoją tam, gdzie żyje miasto — jedzone na stojąco, jak Neapolitańczyk.",
    },
  },
  {
    Icon: HeartIcon,
    title: { en: "Made with passion", pl: "Robione z pasją", it: "fatto con passione" },
    desc: {
      en: "Every dough is folded by hand. Every oven is lit by a pizzaiolo, not a timer.",
      pl: "Każde ciasto składane ręcznie. Każdy piec rozpalany przez pizzaiolo, nie przez timer.",
    },
  },
  {
    Icon: LeafIcon,
    title: { en: "Fresh & local", pl: "Świeże i lokalne", it: "fresco e di stagione" },
    desc: {
      en: "Polish produce when it sings, Italian when it has to. Honest food, no shortcuts.",
      pl: "Polskie produkty, gdy są w sezonie. Włoskie, gdy trzeba. Uczciwe jedzenie, bez skrótów.",
    },
  },
];

export function AboutSection() {
  return (
    <section id="about" className="v8-section v8-alt">
      <div className="v8-inner">
        <div className="v8-about-grid">
          <div className="v8-about-text">
            <div className="v8-eyebrow">
              <Bi en="Our story" pl="Nasza historia" /> ·{" "}
              <span className="v8-it">la nostra storia</span>
            </div>
            <h2 className="v8-about-h">
              <Bi en="From the heart of" pl="Z serca" />{" "}
              <span className="v8-it">Napoli</span>{" "}
              <Bi en="to the streets of" pl="na ulice" />{" "}
              <span className="v8-it">Polska</span>
            </h2>

            <p>
              <Bi
                en="Sud Italia was born from a simple idea: bring the flavours of Southern Italy to Poland without translation. A small team, one wood-fired oven, one truck on the Rynek."
                pl="Sud Italia narodziło się z prostego pomysłu: przenieść smaki Południowych Włoch do Polski bez tłumaczenia. Mały zespół, jeden piec opalany drewnem, jeden lokal na Rynku."
              />
            </p>
            <p>
              <Bi
                en="Today we work from two trucks — Kraków and Warszawa. The dough still rests for 36 hours. The oven still touches 485°C. The"
                pl="Dziś pracujemy z dwóch lokali — Kraków i Warszawa. Ciasto wciąż odpoczywa 36 godzin. Piec wciąż dotyka 485°C."
              />{" "}
              <span className="v8-it-em">San Marzano</span>{" "}
              <Bi
                en="still comes from the slopes of Vesuvius. Some things you don't change."
                pl="Pomidory San Marzano wciąż pochodzą ze stoków Wezuwiusza. Pewnych rzeczy się nie zmienia."
              />
            </p>
            <p>
              <Bi
                en="Whether you're grabbing a slice on your way somewhere or sitting down with friends, every bite should put you, for sixty seconds, on a side street in Naples."
                pl="Czy bierzesz kawałek po drodze, czy siadasz z przyjaciółmi — każdy kęs powinien przenieść Cię na sześćdziesiąt sekund na neapolitańską uliczkę."
              />
            </p>
          </div>

          <div className="v8-values">
            {values.map((v) => (
              <div key={v.title.en} className="v8-value-card">
                <div className="v8-value-icon">
                  <v.Icon />
                </div>
                <h3>
                  <Bi en={v.title.en} pl={v.title.pl} />
                </h3>
                <p>
                  <Bi en={v.desc.en} pl={v.desc.pl} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
