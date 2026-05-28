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

// V8 Trattoria currency pill — sibling of the language pill, in the
// basil-green Tuscany palette. Symbol-only buttons (zł, €, $, S$) keep
// the four currencies in the same width budget as the language row.
// Honours enabledCurrencies from public settings.
//
// Visibility (admin → Settings → Layout → "Currency switcher") is
// handled by the <LayoutGate flag="showCurrencySwitcher"> wrapper at the
// call site (src/components/layout/Header.tsx).
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
    <div className="v8-curr-picker inline-flex items-center rounded-full p-[2px] gap-[2px]" role="radiogroup" aria-label="Display currency">
      {visible.map((code) => {
        const meta = CURRENCY_META[code];
        const active = code === currency;
        return (
          <button
            key={code}
            type="button"
            onClick={() => pick(code)}
            role="radio"
            aria-checked={active}
            title={meta.label}
            className={`v8-curr-opt appearance-none border-0 bg-transparent font-body text-[12px] font-bold tracking-[0.02em] px-[9px] py-[4px] rounded-full leading-none cursor-pointer transition-colors ${
              active ? "v8-curr-opt-active" : ""
            }`}
          >
            {SHORT_SYMBOL[code]}
          </button>
        );
      })}
    </div>
  );
}
