"use client";

import { useEffect, useState } from "react";
import {
  ALL_LOCALES,
  LOCALE_META,
  getLocale,
  setLocale,
  type Locale,
} from "@/lib/i18n";
import {
  ALL_CURRENCIES,
  CURRENCY_META,
  getCurrency,
  setCurrency,
  unmarkAdminContext,
  type Currency,
} from "@/lib/currency";
import { fetchPublicSettings } from "@/lib/public-settings";

/**
 * V8 segmented pills for language + currency. Mirrors the mockup
 * header chrome: every option visible in a single rounded container,
 * the active one filled with terracotta / basil, the others muted.
 *
 * Persistence + reload pattern matches the legacy LanguageSwitcher /
 * CurrencySwitcher, so the cookie + module currentLocale stay in sync.
 */

const LOCALE_SHORT: Record<Locale, string> = {
  pl: "PL",
  en: "EN",
  de: "DE",
  "en-SG": "SG",
};

export function V8LangSwitcher() {
  const [locale, setLocaleState] = useState<Locale>("pl");
  const [enabled, setEnabled] = useState<Locale[]>([...ALL_LOCALES]);

  useEffect(() => {
    setLocaleState(getLocale());
    fetchPublicSettings().then((data) => {
      if (data?.locale?.enabledLocales?.length) {
        setEnabled(data.locale.enabledLocales);
      }
    });
  }, []);

  const pick = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    setLocaleState(next);
    window.location.reload();
  };

  return (
    <div className="v8-seg" role="radiogroup" aria-label="Language">
      {enabled.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(code)}
            className={`v8-seg-btn${active ? " on" : ""}`}
            title={LOCALE_META[code].label}
          >
            {LOCALE_SHORT[code]}
          </button>
        );
      })}
    </div>
  );
}

export function V8CurrencySwitcher() {
  const [currency, setCurrencyState] = useState<Currency>("PLN");
  const [enabled, setEnabled] = useState<Currency[]>([...ALL_CURRENCIES]);

  useEffect(() => {
    unmarkAdminContext();
    const saved = getCurrency();
    setCurrency(saved);
    setCurrencyState(saved);
    fetchPublicSettings().then((data) => {
      if (data?.currency?.enabledCurrencies?.length) {
        setEnabled(data.currency.enabledCurrencies);
      }
    });
  }, []);

  const pick = (next: Currency) => {
    if (next === currency) return;
    setCurrency(next);
    setCurrencyState(next);
    window.location.reload();
  };

  return (
    <div className="v8-seg v8-seg-basil" role="radiogroup" aria-label="Currency">
      {enabled.map((code) => {
        const active = code === currency;
        const meta = CURRENCY_META[code];
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(code)}
            className={`v8-seg-btn${active ? " on" : ""}`}
            title={meta.label}
          >
            {meta.symbol}
          </button>
        );
      })}
    </div>
  );
}
