import Link from "next/link";
import { Bi } from "../Bi";
import { V8CartButton } from "./V8CartButton";
import { V8LangSwitcher, V8CurrencySwitcher } from "./V8LangCurrencySwitcher";

function BasilMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        d="M18 32 C 18 26, 18 20, 18 12"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M18 24 C 14 22, 12 19, 11 16 C 14 17, 17 19, 18 22"
        fill="#4A7C59"
        fillOpacity="0.22"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M18 19 C 22 17, 24 14, 25 11 C 22 12, 19 14, 18 17"
        fill="#4A7C59"
        fillOpacity="0.22"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M18 14 C 15 13, 13 10, 13 7 C 16 8, 17 11, 18 13"
        fill="#4A7C59"
        fillOpacity="0.22"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV: { href: string; en: string; pl: string; it: string }[] = [
  { href: "#menu", en: "Menu", pl: "Menu", it: "Menù" },
  { href: "#bundles", en: "Bundles", pl: "Zestawy", it: "Menù del giorno" },
  { href: "#locations", en: "Locations", pl: "Lokale", it: "Botteghe" },
  { href: "#famiglia", en: "Story", pl: "Historia", it: "La famiglia" },
  { href: "#soci", en: "Rewards", pl: "Nagrody", it: "Soci" },
];

export function V8Header() {
  return (
    <header className="v8-header">
      <div className="v8-header-inner">
        <Link href="/" className="v8-header-brand">
          <span className="v8-header-mark" aria-hidden="true">
            <BasilMark />
          </span>
          <span className="v8-header-brand-text">
            <span className="v8-header-brand-name">Sud Italia</span>
            <span className="v8-header-brand-sub v8-it">
              <Bi en="Neapolitan pizza" pl="Pizza neapolitańska" /> ·{" "}
              pizza napoletana · <Bi en="since 2019" pl="od 2019" />
            </span>
          </span>
        </Link>

        <nav className="v8-header-nav" aria-label="Primary">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="v8-header-nav-link">
              <span className="v8-header-nav-en">
                <Bi en={n.en} pl={n.pl} />
              </span>
              <span className="v8-header-nav-it v8-it">{n.it}</span>
            </Link>
          ))}
        </nav>

        <div className="v8-header-actions">
          <V8LangSwitcher />
          <V8CurrencySwitcher />
          <V8CartButton />
        </div>
      </div>
      <div className="v8-tricolore v8-header-tricolore" />
    </header>
  );
}
