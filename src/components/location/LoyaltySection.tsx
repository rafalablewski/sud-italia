import Link from "next/link";

// V8 Trattoria Soci section — dark espresso closing block with the
// "Members & friends · soci e amici" loyalty pitch + a terracotta
// "Start earning points · inizia a guadagnare punti →" CTA pointing
// to the dedicated /rewards route (Rule #5: loyalty has its own
// page; this is the entry point on the landing).
//
// File path stays `components/location/LoyaltySection.tsx` — it's
// imported by `(public)/page.tsx` and the location-pages route. The
// previous version rendered the interactive <LoyaltyCard /> (which
// asks for phone-number sign-in) inline on the homepage; V8 swaps
// that for a static pitch that funnels to /rewards where the full
// LoyaltyCard already lives.
//
// V8 anchor is `#soci`; we keep `id="loyalty"` because the nav link
// (Rewards) already targets the dedicated /rewards route, not the
// section anchor on this page. Pre-existing deep-links to
// `/#loyalty` continue to work; nothing on the storefront currently
// uses `/#soci` so we don't need to add that anchor either.
//
// Numbers (1 point per złoty, 300 points threshold, the Famiglia Oro
// tier name + the antipasto della casa reward) are marketing copy —
// the canonical loyalty rules live in lib/loyalty.ts and the cart
// drawer / receipt enforce them. If the operator retunes the loyalty
// formula away from "1 pt/zł" the homepage pitch needs a corresponding
// update; the trade-off is the same one bundles took (homepage stays
// in V8's hospitality voice, the canonical numbers live in the
// engine).

export function LoyaltySection() {
  return (
    <section id="loyalty" className="v8-ps v8-ps-dark">
      <div className="v8-page-inner v8-soci-inner">
        <div className="v8-ps-head">
          <div className="v8-ps-eyebrow">
            <span>Members &amp; friends</span>{" "}
            <span className="bi-sec">· soci e amici</span>
          </div>
          <h2 className="v8-ps-title v8-soci-title">
            A pizza, <span className="it">una storia</span>
          </h2>
          <p className="v8-ps-sub v8-soci-sub">
            Earn{" "}
            <strong className="v8-soci-strong">
              1 <span>point</span>
            </strong>{" "}
            for each złoty spent. No app to install — your phone number remembers
            you. <em>Famiglia Oro</em> at 300 points unlocks an{" "}
            <em>antipasto della casa</em> on every visit.
          </p>
        </div>
        <div className="v8-soci-cta-wrap">
          <Link href="/rewards" className="v8-hero-cta">
            <span>Start earning points</span>
            <span className="bi-sec it">· inizia a guadagnare punti</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
