// V8 Trattoria Famiglia strip — a slim italic-Cormorant quote between
// the Bundles section and Menu/Loyalty. NOT a `.v8-ps` section
// (deliberately no eyebrow / title — it's a story moment, not a
// content block) but lives at the `#famiglia` anchor the hero's "Our
// Story" CTA + the nav's "Story" link both target.
//
// Quote + citation are brand copy — V8 picks the Pizzaiolo voice
// ("Giuseppe Esposito · Pizzaiolo") to tie back to the LocationsGrid
// teamLead ("Cooked by Giuseppe and family" on the Kraków card).
// Pizzaiolo == "the pizza-maker" in Italian; the cite uses the
// untranslated title because that's the brand voice V8 designs for
// (the homepage signs its quotes the way an Italian restaurant
// signs its menu — `· Pizzaiolo` over `· Pizza chef`).
//
// File name kept as AboutSection.tsx so (public)/page.tsx + any
// existing LayoutGate flag wiring doesn't churn. The previous
// 4-value-prop About panel (Authentic Recipes / Street Food /
// Made with Passion / Fresh & Quality) is removed — V8's homepage
// uses the slimmer Famiglia strip and pushes the longer story to
// a separate route if it ever lands.

export function AboutSection() {
  return (
    <section id="famiglia" className="v8-famiglia">
      <div className="v8-page-inner">
        <blockquote>
          A pizza, a story. Risen for 36 hours — the way nonna Concetta does
          it in Soccavo, since 1974.
        </blockquote>
        <cite>Giuseppe Esposito · Pizzaiolo</cite>
      </div>
    </section>
  );
}
