// Currency system for Sud Italia.
//
// All prices in the database are stored as PLN grosze (1/100 PLN). When a
// customer picks a non-PLN display currency we convert at render time
// using operator-set exchange rates — the underlying charge is still PLN
// (Stripe account currency). The conversion is display-only and we mirror
// the i18n.ts pattern: module-level state hydrated from localStorage on
// the client, page-reload on change (same as LanguageSwitcher) so SSR
// and client hydration agree.
//
// Admin pages never mount the customer CurrencyProvider so the module
// keeps its PLN default — operators always work in source-of-truth PLN.

export type Currency = "PLN" | "USD" | "SGD" | "EUR";

export const ALL_CURRENCIES: Currency[] = ["PLN", "USD", "SGD", "EUR"];

export const CURRENCY_META: Record<
  Currency,
  { label: string; symbol: string; numberLocale: string }
> = {
  PLN: { label: "Polish Złoty", symbol: "zł", numberLocale: "pl-PL" },
  USD: { label: "US Dollar", symbol: "$", numberLocale: "en-US" },
  SGD: { label: "Singapore Dollar", symbol: "S$", numberLocale: "en-SG" },
  EUR: { label: "Euro", symbol: "€", numberLocale: "de-DE" },
};

// Defaults reflect mid-2026 reference rates per 1 PLN. Operators override
// these in /admin/currency; the public endpoint serves the live values to
// the customer site on mount.
export const DEFAULT_RATES: Record<Currency, number> = {
  PLN: 1,
  USD: 0.25,
  SGD: 0.34,
  EUR: 0.23,
};

let currentCurrency: Currency = "PLN";
let currentRates: Record<Currency, number> = { ...DEFAULT_RATES };

export function setCurrency(currency: Currency) {
  currentCurrency = currency;
  if (typeof window !== "undefined") {
    localStorage.setItem("sud-italia-currency", currency);
  }
}

export function getCurrency(): Currency {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(
      "sud-italia-currency",
    ) as Currency | null;
    if (saved && ALL_CURRENCIES.includes(saved)) return saved;
  }
  return currentCurrency;
}

export function setExchangeRates(rates: Partial<Record<Currency, number>>) {
  currentRates = { ...currentRates, ...rates, PLN: 1 };
}

export function getExchangeRate(currency: Currency): number {
  return currentRates[currency] ?? DEFAULT_RATES[currency] ?? 1;
}

export function getExchangeRates(): Record<Currency, number> {
  return { ...currentRates };
}

/** Convert PLN grosze to the target currency's minor-unit value as a
 *  plain Number. PLN stays integer (grosze); other currencies become
 *  floating after rate × conversion, which is fine because the result is
 *  only ever used for `Intl.NumberFormat` display. */
export function convertFromGrosze(grosze: number, target: Currency): number {
  if (target === "PLN") return grosze / 100;
  const plnZloty = grosze / 100;
  return plnZloty * getExchangeRate(target);
}

/** Currency-aware price formatter. When `currency` is omitted, reads the
 *  customer's preference from localStorage (browser) or the module-level
 *  default (server / admin tree). Reading on every call — same approach
 *  the i18n `t()` helper uses — means re-renders triggered by routine
 *  state changes pick up the saved preference without a forced reload.
 *  Admin pages never call setCurrency and don't write the localStorage
 *  key, so they continue to render PLN — operator source-of-truth. */
export function formatPriceInCurrency(
  grosze: number,
  currency?: Currency,
): string {
  const target = currency ?? getCurrency();
  const meta = CURRENCY_META[target];
  const value = convertFromGrosze(grosze, target);
  return new Intl.NumberFormat(meta.numberLocale, {
    style: "currency",
    currency: target,
  }).format(value);
}
