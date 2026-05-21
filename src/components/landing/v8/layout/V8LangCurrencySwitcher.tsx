"use client";

import { useEffect, useRef, useState } from "react";
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
 * V8-styled language + currency triggers for the parchment header.
 * Each is a tiny "PL / EN" or "PLN / EUR" pill that opens a parchment
 * dropdown. Shares the same persistence + reload pattern as the legacy
 * LanguageSwitcher / CurrencySwitcher.
 */
export function V8LangSwitcher() {
  const [locale, setLocaleState] = useState<Locale>("pl");
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<Locale[]>([...ALL_LOCALES]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocaleState(getLocale());
    fetchPublicSettings().then((data) => {
      if (data?.locale?.enabledLocales?.length) {
        setEnabled(data.locale.enabledLocales);
      }
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = (next: Locale) => {
    setLocale(next);
    setLocaleState(next);
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} className="v8-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="v8-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${LOCALE_META[locale].label}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <path d="M2 8 L14 8 M8 2 C 5 5, 5 11, 8 14 M8 2 C 11 5, 11 11, 8 14" stroke="currentColor" strokeWidth="1.1" fill="none" />
        </svg>
        <span className="v8-switcher-code">
          {locale === "en-SG" ? "SG" : locale.toUpperCase()}
        </span>
      </button>
      {open && (
        <ul className="v8-switcher-menu" role="listbox">
          {enabled.map((code) => {
            const meta = LOCALE_META[code];
            const active = code === locale;
            return (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(code)}
                  className={`v8-switcher-opt${active ? " on" : ""}`}
                >
                  <span aria-hidden="true">{meta.flag}</span>
                  <span>{meta.nativeLabel}</span>
                  {active && <span className="v8-switcher-check">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function V8CurrencySwitcher() {
  const [currency, setCurrencyState] = useState<Currency>("PLN");
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<Currency[]>([...ALL_CURRENCIES]);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = (next: Currency) => {
    setCurrency(next);
    setCurrencyState(next);
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} className="v8-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="v8-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Currency: ${CURRENCY_META[currency].label}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <path d="M5 6 C 5 4, 7 4, 8 5 M5 10 C 5 12, 7 12, 8 11 M4 8 L11 8" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </svg>
        <span className="v8-switcher-code">{currency}</span>
      </button>
      {open && (
        <ul className="v8-switcher-menu" role="listbox">
          {enabled.map((code) => {
            const meta = CURRENCY_META[code];
            const active = code === currency;
            return (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(code)}
                  className={`v8-switcher-opt${active ? " on" : ""}`}
                >
                  <span className="v8-switcher-code v8-num">{code}</span>
                  <span aria-hidden="true">{meta.symbol}</span>
                  <span className="v8-switcher-opt-name">{meta.label}</span>
                  {active && <span className="v8-switcher-check">✓</span>}
                </button>
              </li>
            );
          })}
          {currency !== "PLN" && (
            <li className="v8-switcher-foot v8-it">
              Prices in {currency} for reference — orders charged in PLN.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
