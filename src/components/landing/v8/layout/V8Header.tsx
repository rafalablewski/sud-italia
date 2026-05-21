import Link from "next/link";
import { Bi } from "../Bi";
import { V8CartButton } from "./V8CartButton";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { CurrencySwitcher } from "@/components/ui/CurrencySwitcher";

function BasilMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <path
        d="M19 33 C 19 27, 19 20, 19 12"
        stroke="#4A7C59"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M19 24 C 14 22, 11 19, 10 15 C 14 17, 17 19, 19 22"
        fill="#4A7C59"
        fillOpacity="0.3"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M19 19 C 24 17, 27 14, 28 10 C 24 12, 21 14, 19 17"
        fill="#4A7C59"
        fillOpacity="0.3"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
            <span className="v8-header-brand-sub v8-it">italian street food</span>
          </span>
        </Link>

        <nav className="v8-header-nav" aria-label="Primary">
          <Link href="#locations" className="v8-header-nav-link">
            <Bi en="Locations" pl="Lokale" />
          </Link>
          <Link href="#bundles" className="v8-header-nav-link">
            <Bi en="Bundles" pl="Zestawy" />
          </Link>
          <Link href="#soci" className="v8-header-nav-link">
            <Bi en="Rewards" pl="Nagrody" />
          </Link>
        </nav>

        <div className="v8-header-actions">
          <CurrencySwitcher />
          <LanguageSwitcher />
          <V8CartButton />
        </div>
      </div>
      <div className="v8-tricolore v8-header-tricolore" />
    </header>
  );
}
