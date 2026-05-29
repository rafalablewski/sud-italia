"use client";

import { useEffect, useState } from "react";
import {
  ALL_CURRENCIES,
  CURRENCY_META,
  getCurrency,
  setCurrency,
  unmarkAdminContext,
  type Currency,
} from "@/lib/currency";
import { fetchPublicSettings } from "@/lib/public-settings";
import { NavDropdown } from "./NavDropdown";

// V8 Trattoria currency switcher — collapsible sibling of
// <LanguageSwitcher /> in the basil-green palette. Trigger shows the
// active symbol (zł / € / $ / S$); clicking expands a small panel
// listing every enabled currency by symbol + label (Polish Złoty,
// Euro, US Dollar, Singapore Dollar). Replaces the previous
// always-expanded segmented row.
//
// Visibility (admin → Settings → Layout → "Currency switcher") is
// handled by the <LayoutGate flag="showCurrencySwitcher"> wrapper at
// the call site (src/components/layout/Header.tsx).
const SHORT_SYMBOL: Record<Currency, string> = {
  PLN: "zł",
  EUR: "€",
  USD: "$",
  SGD: "S$",
};

export function CurrencySwitcher() {
  const [currency, setCurrencyState] = useState<Currency>("PLN");
  const [enabled, setEnabled] = useState<Currency[]>([...ALL_CURRENCIES]);

  useEffect(() => {
    // Clear any admin-context pin from a previous /admin visit — the
    // customer site should reflect the visitor's stored preference, not
    // the operator's forced PLN.
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
    // Reload so every formatPrice() call across the SSR tree re-renders
    // with the new currency. Mirrors the LanguageSwitcher reload pattern.
    window.location.reload();
  };

  const visible = ALL_CURRENCIES.filter((c) => enabled.includes(c));

  return (
    <NavDropdown label={SHORT_SYMBOL[currency]} ariaLabel="Display currency" tone="basil">
      {(close) =>
        visible.map((code) => {
          const meta = CURRENCY_META[code];
          const active = code === currency;
          return (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                close();
                pick(code);
              }}
              className="v8-switcher-opt"
            >
              <span className="v8-switcher-opt-code">{SHORT_SYMBOL[code]}</span>
              <span className="v8-switcher-opt-label">{meta.label}</span>
            </button>
          );
        })
      }
    </NavDropdown>
  );
}
