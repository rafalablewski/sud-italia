import { Location } from "./types";

/**
 * Hardcoded seed list. **Not** the runtime source of truth — that's the
 * `locations` Postgres table populated via /admin/locations/manage
 * (m4_1, audit §2 "Scalability (ops)"). This file is:
 *
 *   1. The first-deploy fallback when the DB table is empty.
 *   2. The dev / CI source when DATABASE_URL is unset.
 *   3. The source for client components that import synchronously
 *      (landing page, footer, location switcher). The seed should
 *      stay roughly in sync with the DB; admin edits propagate to
 *      DB-backed paths (crons, API routes) within ≤ 30 seconds.
 *
 * Server-side code that needs the live DB list should import from
 * `@/lib/locations-store` instead.
 */
export const locations: Location[] = [
  {
    slug: "krakow",
    name: "Ottaviano - Kraków",
    city: "Kraków",
    code: "KRK",
    district: "Rynek",
    address: "Rynek Główny, 31-042 Kraków",
    coordinates: { lat: 50.0614, lng: 19.9372 },
    heroImage: "/images/locations/krakow-hero.jpg",
    description:
      "Experience authentic Neapolitan flavors in the heart of Kraków. Our restaurant brings the warmth of Southern Italy to the historic Main Square, serving hand-crafted pizza, fresh pasta, and classic Italian cuisine made with imported ingredients and traditional recipes passed down through generations.",
    shortDescription:
      "Authentic Neapolitan pizza & pasta at Kraków's Main Square",
    hours: [
      { day: "Mon-Sun", open: "12:00", close: "21:00" },
    ],
    isActive: true,
    currency: "PLN",
    teamLead: "Cooked by Giuseppe and family",
  },
  {
    slug: "warszawa",
    name: "Ottaviano - Warszawa",
    city: "Warszawa",
    code: "WAW",
    district: "Śródmieście",
    address: "ul. Nowy Świat 15, 00-029 Warszawa",
    coordinates: { lat: 52.2297, lng: 21.0122 },
    heroImage: "/images/locations/warszawa-hero.jpg",
    description:
      "Bringing a taste of Naples to Warsaw's vibrant Nowy Świat street. Our Warsaw restaurant serves the same beloved recipes with locally-sourced produce and imported Italian specialties. From wood-fired pizza margherita to creamy burrata antipasti — it's a little piece of Southern Italy in the capital.",
    shortDescription:
      "A taste of Naples on Warsaw's iconic Nowy Świat street",
    hours: [
      { day: "Mon-Sun", open: "12:00", close: "21:00" },
    ],
    isActive: true,
    currency: "PLN",
    teamLead: "Cooked by Anna and crew",
  },
  {
    slug: "wroclaw",
    name: "Ottaviano - Wrocław",
    city: "Wrocław",
    code: "WRO",
    district: "Rynek",
    address: "Rynek 1, 50-106 Wrocław",
    coordinates: { lat: 51.1079, lng: 17.0385 },
    heroImage: "/images/locations/wroclaw-hero.jpg",
    description:
      "Coming soon to Wrocław's beautiful Market Square. Ottaviano will bring its signature Neapolitan cuisine to Lower Silesia, offering the same commitment to quality and authenticity that our customers in Kraków and Warsaw have come to love.",
    shortDescription: "Coming soon to Wrocław's Market Square",
    hours: [
      { day: "Mon-Sun", open: "11:00", close: "21:00" },
    ],
    isActive: false,
    currency: "PLN",
  },
];

export function getLocation(slug: string): Location | undefined {
  return locations.find((l) => l.slug === slug);
}

export function getActiveLocations(): Location[] {
  return locations.filter((l) => l.isActive);
}

// Day-name → JS Date.getDay() index (Sun=0). Ottaviano's hours strings use
// English short names (Mon-Thu, Fri-Sat, Sun, Mon-Sun, etc.) — we parse
// either a single day token ("Sun") or an inclusive range ("Mon-Thu").
const DAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function dayInRange(dayStr: string, jsDay: number): boolean {
  const parts = dayStr.split("-").map((p) => p.trim());
  if (parts.length === 1) {
    return DAY_INDEX[parts[0]] === jsDay;
  }
  const start = DAY_INDEX[parts[0]];
  const end = DAY_INDEX[parts[1]];
  if (start === undefined || end === undefined) return false;
  // Range can wrap (e.g. "Fri-Mon" = Fri,Sat,Sun,Mon).
  if (start <= end) return jsDay >= start && jsDay <= end;
  return jsDay >= start || jsDay <= end;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Returns true when `location` is within at least one of its `hours`
 * ranges right now.
 *
 * Handles three day-string forms — single day `"Sun"`, ordered range
 * `"Mon-Thu"`, and wrap range `"Fri-Mon"` (Fri/Sat/Sun/Mon — start
 * index > end index). Each hour pair also wraps defensively: when
 * `close <= open` the window is treated as overnight, and the helper
 * checks BOTH today (`open–24:00`) AND the previous day (`00:00–close`)
 * — so a `{ day: "Fri", open: "22:00", close: "02:00" }` schedule
 * reports open at Saturday 01:30 even though `"Fri"` doesn't include
 * Saturday as a day token. The seed data doesn't use either wrap form
 * today; the support is here so adding them later doesn't silently
 * break the open-now signal.
 *
 * Used by the homepage hero kicker (V8 "Open now" pill) and any
 * future open-state UI that needs accuracy rather than the
 * `isActive` proxy LocationsGrid currently uses.
 */
export function isLocationOpenNow(location: Location, now: Date = new Date()): boolean {
  if (!location.isActive) return false;
  const jsDay = now.getDay();
  // (jsDay + 6) % 7 == yesterday — Sun(0) → Sat(6), Mon(1) → Sun(0), etc.
  const prevJsDay = (jsDay + 6) % 7;
  const minsNow = now.getHours() * 60 + now.getMinutes();
  return location.hours.some((h) => {
    const open = toMinutes(h.open);
    const close = toMinutes(h.close);
    const isOvernight = close <= open;

    // Branch 1 — today is in the day range. Normal hours need
    // [open, close); overnight hours match the [open, 24:00) tail.
    if (dayInRange(h.day, jsDay)) {
      if (isOvernight) {
        if (minsNow >= open) return true;
      } else if (minsNow >= open && minsNow < close) {
        return true;
      }
    }

    // Branch 2 — yesterday was in the day range AND the schedule is
    // overnight: we're inside the [00:00, close) tail of yesterday's
    // window. Without this branch a "Fri 22:00–02:00" slot would
    // silently close at midnight because Saturday isn't a `"Fri"` day.
    if (isOvernight && dayInRange(h.day, prevJsDay) && minsNow < close) {
      return true;
    }

    return false;
  });
}

/**
 * Active locations that are within their service hours right now.
 * Returns [] outside business hours — callers should fall back to a
 * "Opens at HH:MM" message in that case (see HeroSection.tsx).
 */
export function getOpenLocations(now: Date = new Date()): Location[] {
  return getActiveLocations().filter((l) => isLocationOpenNow(l, now));
}

/**
 * Returns the `{ day, open, close }` slot currently in effect for the
 * location, or null when closed. Used by the V8 location-page hero
 * status pill to render "Open until 21:00 · aperto fino alle 21:00"
 * with the real close time, not a hardcoded label.
 *
 * Same two-branch logic as `isLocationOpenNow`:
 *   - Today's range, normal-hour window OR overnight head [open, 24h)
 *   - Yesterday's range when the slot is overnight + we're in
 *     [00:00, close)
 *
 * Returns the first matching slot — if multiple slots overlap (which
 * the seed data avoids) the earlier entry wins.
 */
export function getCurrentHourSlot(
  location: Location,
  now: Date = new Date(),
): Location["hours"][number] | null {
  if (!location.isActive) return null;
  const jsDay = now.getDay();
  const prevJsDay = (jsDay + 6) % 7;
  const minsNow = now.getHours() * 60 + now.getMinutes();
  for (const h of location.hours) {
    const open = toMinutes(h.open);
    const close = toMinutes(h.close);
    const isOvernight = close <= open;

    if (dayInRange(h.day, jsDay)) {
      if (isOvernight && minsNow >= open) return h;
      if (!isOvernight && minsNow >= open && minsNow < close) return h;
    }
    if (isOvernight && dayInRange(h.day, prevJsDay) && minsNow < close) {
      return h;
    }
  }
  return null;
}
