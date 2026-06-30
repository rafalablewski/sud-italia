/**
 * Money + clock formatting. Wire money is always grosze (minor units); the apps
 * format here so a single helper governs every "zł" on screen (DESIGN-SYSTEM §4.2,
 * the native `MoneyText`).
 */

export function formatMoney(grosze: number | null | undefined, withSymbol = true): string {
  // Manual formatting (no Intl/toLocaleString — the Hermes engine ships a minimal
  // Intl, so a locale-formatted number can't be relied on). Polish convention:
  // space thousands separator, comma decimal — "1 234,50 zł".
  const negative = (grosze ?? 0) < 0;
  const cents = Math.round(Math.abs(grosze ?? 0));
  const zl = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const grouped = String(zl).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const body = `${negative ? "−" : ""}${grouped},${fraction}`;
  return withSymbol ? `${body} zł` : body;
}

/** Compact zł/hr figure: 3140 grosze → "31", 310000 → "3.1k" (web `revPerHr`). */
export function compactMoney(grosze: number): string {
  const z = grosze / 100;
  return z >= 1000 ? `${(z / 1000).toFixed(1)}k` : `${Math.round(z)}`;
}

/** mm:ss for a seconds value; caller-side sign for negatives (web `fmtClock`). */
export function fmtClock(seconds: number): string {
  const total = Math.round(Math.abs(seconds));
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${seconds < 0 ? "-" : ""}${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** ISO-8601 → ms epoch, tolerant of fractional seconds and missing input. */
export function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}
