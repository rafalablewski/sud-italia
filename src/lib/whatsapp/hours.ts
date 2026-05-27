import type { WaSettings } from "@/lib/store";

/** Minutes since midnight for an "HH:MM" string, or null if malformed. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Is `at` within the configured opening hours? Always true when the schedule
 * is disabled or unconfigured, so the default (no schedule) never gates the
 * bot. Evaluated in Europe/Warsaw regardless of server timezone. A close time
 * at or before the open time is treated as crossing midnight.
 */
export function isWithinBusinessHours(
  bh: WaSettings["businessHours"] | undefined,
  at: Date = new Date(),
): boolean {
  if (!bh || !bh.enabled || !Array.isArray(bh.days) || bh.days.length < 7) return true;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  if (dayIndex < 0) return true;

  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  // Intl can emit "24" at midnight for hour12:false; normalise to 0.
  if (hour === 24) hour = 0;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const now = hour * 60 + minute;

  const day = bh.days[dayIndex];
  if (!day || day.closed) return false;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open == null || close == null) return true; // malformed config → don't gate

  return close > open ? now >= open && now < close : now >= open || now < close;
}
