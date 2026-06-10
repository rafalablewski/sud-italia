/**
 * Compact relative timestamps for scannable lists (the notification inbox, the
 * bell glance). Recent items read as "Just now / 5m / 3h / Yesterday / Mon",
 * older ones fall back to an absolute "D Mon" (with the year once it's not this
 * year). The precise absolute date+time still lives in the opened message — this
 * is only the at-a-glance label on a collapsed row.
 *
 * Pure + `now`-injectable so it's deterministic to test and never reads the
 * clock implicitly. Locale defaults to pl-PL to match the rest of the portal.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function fmtRelative(iso?: string, now: number = Date.now(), locale = "pl-PL"): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const diff = now - then;
  // Future or clock-skew: don't show a negative age, just pin to "Just now".
  if (diff < MINUTE) return "Just now";

  // Calendar-day reasoning so "Yesterday" lines up with the wall calendar, not a
  // rolling 24h window — an 11pm note read at noon is "Yesterday", not "13h".
  const dayGap = Math.round((startOfDay(now) - startOfDay(then)) / (24 * HOUR));
  if (dayGap <= 0) {
    // Today: a compact minutes/hours age.
    return diff < HOUR ? `${Math.floor(diff / MINUTE)}m` : `${Math.floor(diff / HOUR)}h`;
  }
  if (dayGap === 1) return "Yesterday";
  if (dayGap < 7) return new Date(then).toLocaleDateString(locale, { weekday: "short" });

  const sameYear = new Date(then).getFullYear() === new Date(now).getFullYear();
  return new Date(then).toLocaleDateString(
    locale,
    sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" },
  );
}
