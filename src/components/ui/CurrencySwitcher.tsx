"use client";

import { useEffect, useRef, useState } from "react";
import {
  ALL_CURRENCIES,
  CURRENCY_META,
  getCurrency,
  setCurrency,
  unmarkAdminContext,
  type Currency,
} from "@/lib/currency";
import { fetchPublicSettings } from "@/lib/public-settings";
import { Coins, Check } from "lucide-react";

// Visibility (admin → Settings → Layout → "Currency switcher") is handled
// by the <LayoutGate flag="showCurrencySwitcher"> wrapper at the call
// site (src/components/layout/Header.tsx), so this component focuses on
// the switcher logic itself.
export function CurrencySwitcher() {
  const [currency, setCurrencyState] = useState<Currency>("PLN");
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<Currency[]>([...ALL_CURRENCIES]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clear any admin-context pin from a previous /admin visit — the
    // customer site should reflect the visitor's stored preference, not
    // the operator's forced PLN.
    unmarkAdminContext();
    // Hydrate the module's currentCurrency from the cookie / localStorage
    // so every subsequent formatPrice() in the customer tree picks up the
    // user's saved preference.
    const saved = getCurrency();
    setCurrency(saved);
    setCurrencyState(saved);
    // Shared single-flight fetch — LanguageSwitcher + cart drawer reuse
    // the cached response, so the top bar only hits /api/settings/public
    // once per page load.
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
    // Reload so every formatPrice() call across the SSR tree re-renders
    // with the new currency. Mirrors the LanguageSwitcher reload pattern.
    window.location.reload();
  };

  const current = CURRENCY_META[currency];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-italia-gray hover:bg-gray-100 transition-colors min-h-[44px]"
        title={`Currency: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Coins className="h-4 w-4" />
        <span className="font-semibold">{currency}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 min-w-[14rem] bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
        >
          {enabled.map((code) => {
            const meta = CURRENCY_META[code];
            const active = code === currency;
            return (
              <li key={code}>
                <button
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(code)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${
                    active ? "text-italia-red font-semibold" : "text-italia-dark"
                  }`}
                >
                  <span className="flex flex-col items-start text-left">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs">{code}</span>
                      <span>{meta.symbol}</span>
                    </span>
                    <span className="text-[11px] text-italia-gray">{meta.label}</span>
                  </span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
          {currency !== "PLN" && (
            <li className="px-3 pt-2 pb-1 border-t border-gray-100 mt-1 text-[10px] text-italia-gray leading-snug">
              Prices shown in {currency} for reference — orders are charged in PLN.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
