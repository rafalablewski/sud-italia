import { Bi } from "./Bi";

export function FamigliaQuote() {
  return (
    <section id="famiglia" className="v8-famiglia">
      <blockquote>
        <Bi
          en="A pizza, a story. Risen for 36 hours — the way it has always been done in Naples."
          pl="Pizza, historia. Wyrasta przez 36 godzin — tak jak od zawsze robi się to w Neapolu."
        />
      </blockquote>
      <cite>
        Sud Italia · <span className="v8-it">la cucina</span>
      </cite>
    </section>
  );
}
