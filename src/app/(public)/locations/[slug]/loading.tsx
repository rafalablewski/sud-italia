// V8 Trattoria loading skeleton for /locations/[slug].
//
// Mirrors the real location page's shape — parchment back-chip strip,
// short parchment-gradient hero (`.v8-loc-hero`), then the glass menu
// card (`.v8-menu-card`) with a category-row + grid of placeholder
// cards. Renders into the same `(public)` layout that loads the
// homepage theme tokens, so the route transition reads as one
// continuous parchment surface from first paint.
//
// Pre-V8 builds shipped a `bg-italia-dark` h-72 / h-96 block here
// (an old full-bleed dark-photo hero placeholder), which flashed as
// a dark espresso slab in the V8 layout chrome before the real page
// hydrated — the "old theme flash" V8 polish flagged. The skeleton
// now matches the new hero's parchment ground, illustration
// placeholder, name + tagline + status pill, and the menu card's
// eyebrow / title / search / 2-column item grid.
export default function Loading() {
  return (
    <div className="v8-loc-loading" aria-busy="true" aria-live="polite">
      <header className="v8-loc-hero">
        <div className="v8-skel v8-skel-chip v8-loc-back-chip" aria-hidden />
        <div className="v8-loc-hero-inner">
          <div className="v8-skel v8-skel-illus" aria-hidden />
          <div className="v8-skel v8-skel-tricolore" aria-hidden />
          <div className="v8-skel v8-skel-h1" aria-hidden />
          <div className="v8-skel v8-skel-sub" aria-hidden />
          <div className="v8-skel v8-skel-status" aria-hidden />
        </div>
      </header>

      <section className="v8-menu-card">
        <div className="v8-skel v8-skel-eyebrow" aria-hidden />
        <div className="v8-skel v8-skel-title" aria-hidden />
        <div className="v8-skel v8-skel-search" aria-hidden />
        <div className="v8-skel-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="v8-skel v8-skel-card" aria-hidden />
          ))}
        </div>
      </section>

      <span className="sr-only">Loading location…</span>
    </div>
  );
}
