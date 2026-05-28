import Link from "next/link";
import {
  SITE_NAME,
  COMPANY_NAME,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  SOCIAL_LINKS,
} from "@/lib/constants";
import { getActiveLocations } from "@/data/locations";

// V8 Trattoria footer — espresso canvas that picks up the Soci rail's
// palette so the close→footer transition reads as one visual block
// rather than a dark→light jolt. Four-column grid on desktop (1.4fr
// brand + 1fr × 3 link cols), single column stack on mobile.
//
// We keep the **existing** column content (Locations / Contact /
// Follow Us) over V8's mockup copy (Menu / Locations / For
// businesses) because those columns wire to real operator data —
// CONTACT_EMAIL, CONTACT_PHONE, SOCIAL_LINKS from lib/constants and
// the active locations list. V8's mockup ships marketing-led copy
// the operator hasn't actually written yet ("Team lunch — invoiced",
// "Private events", a placeholder phone number); shipping the
// mockup's text would be Rule #1 territory ("never hardcoded
// data"). The visual treatment — italic-Cormorant ochre-light
// column heads, parchment-70% link colour, the basil-sprig brand
// mark with ochre-light strokes, the tricolore hairline under the
// brand block, the italic-Cormorant copyright tagline — comes
// straight from V8.

export function Footer() {
  const locations = getActiveLocations();
  const year = new Date().getFullYear();

  return (
    <footer className="v8-pfoot">
      <div className="v8-page-inner">
        <div className="v8-pfoot-grid">
          {/* Brand */}
          <div>
            <div className="v8-pfoot-brand">
              <FooterBasilMark />
              <span>{SITE_NAME}</span>
            </div>
            <p>
              Authentic Italian street food by {COMPANY_NAME}. Bringing the
              flavours of Southern Italy to Poland, one food truck at a time.
            </p>
            <div className="v8-tricolore v8-pfoot-trico" aria-hidden />
          </div>

          {/* Locations */}
          <div>
            <h4>Locations</h4>
            <ul>
              {locations.map((loc) => (
                <li key={loc.slug}>
                  <Link href={`/locations/${loc.slug}`}>{loc.name}</Link>
                </li>
              ))}
              <li>
                <Link href="/#famiglia">Our story · la nostra storia</Link>
              </li>
              <li>
                <Link href="/rewards">Loyalty programme · soci</Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4>Contact</h4>
            <ul>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </li>
              <li>
                <a href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`}>{CONTACT_PHONE}</a>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
            </ul>
          </div>

          {/* Follow */}
          <div>
            <h4>Follow us · seguiteci</h4>
            <ul>
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
              <li>
                <a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer">
                  TikTok
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="v8-pfoot-bottom">
          <span>
            &copy; {year} {SITE_NAME} by {COMPANY_NAME}. ·{" "}
            <em>&ldquo;Mangia bene, ridi spesso, ama molto.&rdquo;</em>
          </span>
          <span>Made with passion in Napoli · cooked in Polska</span>
        </div>
      </div>
    </footer>
  );
}

// Footer basil-mark — V8's variant of the nav brand mark with
// ochre-light strokes + basil-translucent leaves so the sprig reads
// against the espresso canvas (the nav's all-basil version would
// vanish into the dark bg).
function FooterBasilMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 38 38" fill="none" aria-hidden>
      <path d="M19 33 C 19 27, 19 20, 19 12" stroke="#E6C97A" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19 24 C 14 22, 11 19, 10 15 C 14 17, 17 19, 19 22" fill="#4A7C59" fillOpacity="0.3" stroke="#E6C97A" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19 19 C 24 17, 27 14, 28 10 C 24 12, 21 14, 19 17" fill="#4A7C59" fillOpacity="0.3" stroke="#E6C97A" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19 14 C 16 12, 14 9, 14 6 C 17 7, 18 10, 19 12" fill="#4A7C59" fillOpacity="0.3" stroke="#E6C97A" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
