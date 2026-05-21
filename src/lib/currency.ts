// Currency system for Sud Italia.
//
// All prices in the database are stored as PLN grosze (1/100 PLN). When a
// customer picks a non-PLN display currency we convert at render time
// using operator-set exchange rates — the underlying charge is still PLN
// (Stripe account currency). Display-only.
//
// Persistence: a per-origin cookie (`sud-italia-currency`) so the server
// can read the preference via `next/headers` and render the right number
// in the initial HTML, plus a localStorage mirror so older client code
// keeps reading the value through `getCurrency()`. The cookie is the
// authoritative source — localStorage is a convenience fallback for
// pages that haven't been refactored to read it server-side.
//
// Admin contexts: `formatPrice()` in admin pages must always return PLN
// because the operator works in source-of-truth currency. Cookies are
// origin-wide so we can't naturally scope away — instead, the admin
// layout mounts <AdminCurrencyGuard /> on first paint, which calls
// `markAdminContext()` and pins the formatter to PLN for the duration
// of that client session. Returning to customer routes via
// CurrencySwitcher's effect clears the pin (calls
// `unmarkAdminContext()`). For admin server components, prefer
// `formatPricePLN()` (the explicit PLN helper in `src/lib/utils.ts`).

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

export const CURRENCY_COOKIE = "sud-italia-currency";
const CURRENCY_STORAGE_KEY = "sud-italia-currency";

let currentCurrency: Currency = "PLN";
let currentRates: Record<Currency, number> = { ...DEFAULT_RATES };

// Admin-context pin — set by <AdminCurrencyGuard/> on mount, cleared by
// the customer CurrencySwitcher when it next reads the cookie. While the
// pin is on, `getCurrency()` always returns "PLN" regardless of cookie /
// localStorage state — kills the "operator visits /locations, switches
// to USD, navigates to /admin, sees USD in back-office reports" leak.
let adminPinned = false;

export function markAdminContext() {
  adminPinned = true;
}

export function unmarkAdminContext() {
  adminPinned = false;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = `${name}=`;
  for (const raw of document.cookie.split(";")) {
    const c = raw.trim();
    if (c.startsWith(target)) return decodeURIComponent(c.slice(target.length));
  }
  return null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  // 1-year persistence is enough — preferences are not security-sensitive.
  // SameSite=Lax keeps it from leaking on cross-site embeds.
  const oneYearSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYearSeconds}; samesite=lax`;
}

export function setCurrency(currency: Currency) {
  currentCurrency = currency;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    } catch {
      // Storage can be disabled (Safari private mode etc.) — cookie is
      // the authoritative source anyway, swallow the error.
    }
    writeCookie(CURRENCY_COOKIE, currency);
  }
}

export function getCurrency(): Currency {
  if (adminPinned) return "PLN";
  if (typeof window !== "undefined") {
    // Cookie first (mirrors what the server reads) so the formatter
    // matches whatever the server rendered for the initial HTML.
    const fromCookie = readCookie(CURRENCY_COOKIE) as Currency | null;
    if (fromCookie && ALL_CURRENCIES.includes(fromCookie)) return fromCookie;
    try {
      const saved = localStorage.getItem(CURRENCY_STORAGE_KEY) as Currency | null;
      if (saved && ALL_CURRENCIES.includes(saved)) return saved;
    } catch {
      // Same fallback as above.
    }
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

// `Intl.NumberFormat` construction is non-trivial — ICU locale lookup +
// pattern parsing — and rendering a 30-item menu page calls formatPrice()
// dozens of times. Cache the formatter once per currency so we pay that
// cost on the first call only. Cleared if process restarts; safe to
// share across requests because the formatter is configured solely from
// the currency code.
const formatterCache = new Map<Currency, Intl.NumberFormat>();

function getFormatter(target: Currency): Intl.NumberFormat {
  const hit = formatterCache.get(target);
  if (hit) return hit;
  const meta = CURRENCY_META[target];
  const fmt = new Intl.NumberFormat(meta.numberLocale, {
    style: "currency",
    currency: target,
  });
  formatterCache.set(target, fmt);
  return fmt;
}

/** Currency-aware price formatter. When `currency` is omitted, reads the
 *  customer's preference from the cookie (server + client) or
 *  localStorage fallback (legacy). The admin pin (set by
 *  <AdminCurrencyGuard/>) forces PLN regardless. */
export function formatPriceInCurrency(
  grosze: number,
  currency?: Currency,
): string {
  const target = currency ?? getCurrency();
  return getFormatter(target).format(convertFromGrosze(grosze, target));
}
