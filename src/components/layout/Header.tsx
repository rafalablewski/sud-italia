"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { CartButton } from "@/components/cart/CartButton";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { CurrencySwitcher } from "@/components/ui/CurrencySwitcher";
import { LayoutGate } from "@/components/layout/LayoutGate";

// V8 Trattoria Header — sticky parchment-gradient bar with the basil-sprig
// brand mark on the left, bilingual nav links (EN/PL primary + Italian
// italic subtitle) in the centre at ≥900px, language + currency pill
// switchers, V8 cart pill, and a mobile hamburger circle. The layout
// hash links target the homepage section IDs the V8 mockup uses
// (#menu, #bundles, #locations, #famiglia, #soci) so the nav anchors land
// even from a deep route — the homepage renders matching IDs in the
// section ports that follow.
//
// Live activity (orders/hour, currently preparing, trending, avg prep)
// lives in <LiveTicker /> below the header — same espresso bar V8 places
// directly under the nav.
const NAV_LINKS = [
  { href: "/#menu", en: "Menu", pl: "Menu", it: "Menù" },
  { href: "/#bundles", en: "Bundles", pl: "Zestawy", it: "Menù del giorno" },
  { href: "/#locations", en: "Locations", pl: "Lokalizacje", it: "Botteghe" },
  { href: "/#famiglia", en: "Story", pl: "Historia", it: "La famiglia" },
  { href: "/rewards", en: "Rewards", pl: "Nagrody", it: "Soci" },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`v8-nav sticky top-0 z-30 backdrop-blur-sm border-b transition-shadow ${
        scrolled ? "v8-nav-scrolled" : ""
      }`}
      aria-label="Primary"
    >
      <div className="max-w-[1180px] mx-auto px-[18px] md:px-[36px] py-[14px] md:py-[18px] flex items-center gap-[18px]">
        {/* Brand mark + wordmark */}
        <Link href="/" className="v8-brand flex items-center gap-[10px] no-underline text-espresso">
          <span className="v8-brand-mark grid place-items-center" aria-hidden>
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <path d="M19 33 C 19 27, 19 20, 19 12" stroke="#4A7C59" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M19 24 C 14 22, 11 19, 10 15 C 14 17, 17 19, 19 22" fill="#4A7C59" fillOpacity="0.22" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M19 19 C 24 17, 27 14, 28 10 C 24 12, 21 14, 19 17" fill="#4A7C59" fillOpacity="0.22" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M19 14 C 16 12, 14 9, 14 6 C 17 7, 18 10, 19 12" fill="#4A7C59" fillOpacity="0.22" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="19" cy="34" r="1.3" fill="#B85C38" />
            </svg>
          </span>
          <div>
            <div className="font-heading font-semibold text-[24px] leading-none tracking-[0.3px] text-espresso">
              Sud Italia
            </div>
            <div className="v8-brand-sub font-heading italic text-[11.5px] text-muted tracking-[0.8px] mt-[1px] hidden md:block">
              <span className="it">Pizza napoletana</span> · est. 2019
            </div>
          </div>
        </Link>

        {/* Desktop nav links (≥900px) */}
        <ul className="v8-nav-links list-none p-0 m-0 ml-[18px] gap-[22px] hidden lg:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="v8-nav-link font-heading text-[16px] text-espresso no-underline py-1 relative inline-block">
                <span>{l.en}</span>
                <span className="it">{l.it}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Right cluster — language / currency switchers + cart + the
            mobile hamburger. `ml-auto` at every breakpoint so the
            cluster is always flush to the right edge of the 1180px
            container; the nav-links sit left-of-centre against the
            brand and the switchers + cart land on the right. On <md
            the two switchers hide from the top bar and surface inside
            the mobile menu instead. Cart + hamburger stay at every
            width. */}
        <div className="v8-nav-right ml-auto flex items-center gap-[10px]">
          <LayoutGate flag="showLanguageSwitcher">
            <div className="hidden md:inline-flex">
              <LanguageSwitcher />
            </div>
          </LayoutGate>
          <LayoutGate flag="showCurrencySwitcher">
            <div className="hidden md:inline-flex">
              <CurrencySwitcher />
            </div>
          </LayoutGate>
          <CartButton />
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="v8-nav-mobile-btn inline-flex lg:hidden items-center justify-center w-[38px] h-[38px] bg-transparent border border-line rounded-full text-espresso"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
              {mobileOpen ? (
                <path d="M2 2 L16 12 M16 2 L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M1 2 L17 2 M1 7 L17 7 M1 12 L17 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu — slides under the nav-inner on <lg screens. The
          language + currency pills move into the menu below the link
          list so they remain reachable when the top-bar can't fit them. */}
      {mobileOpen && (
        <div className="v8-nav-mobile-menu border-t border-line-soft px-[18px] py-[12px] pb-[16px] lg:hidden">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="v8-nav-mobile-link block py-[10px] font-heading text-[18px] text-espresso no-underline border-b border-dashed border-line-soft last:border-b-0"
            >
              <span>{l.en}</span> <span className="it">{l.it}</span>
            </Link>
          ))}
          <div className="md:hidden flex items-center gap-[10px] pt-[14px] mt-[6px] border-t border-dashed border-line-soft">
            <LayoutGate flag="showLanguageSwitcher">
              <LanguageSwitcher />
            </LayoutGate>
            <LayoutGate flag="showCurrencySwitcher">
              <CurrencySwitcher />
            </LayoutGate>
          </div>
        </div>
      )}
    </header>
  );
}
