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
    name: "Sud Italia - Kraków",
    city: "Kraków",
    address: "Rynek Główny, 31-042 Kraków",
    coordinates: { lat: 50.0614, lng: 19.9372 },
    heroImage: "/images/locations/krakow-hero.jpg",
    description:
      "Experience authentic Neapolitan flavors in the heart of Kraków. Our food truck brings the warmth of Southern Italy to the historic Main Square, serving hand-crafted pizza, fresh pasta, and classic Italian street food made with imported ingredients and traditional recipes passed down through generations.",
    shortDescription:
      "Authentic Neapolitan pizza & pasta at Kraków's Main Square",
    hours: [
      { day: "Mon-Thu", open: "11:00", close: "21:00" },
      { day: "Fri-Sat", open: "11:00", close: "23:00" },
      { day: "Sun", open: "12:00", close: "20:00" },
    ],
    isActive: true,
    currency: "PLN",
  },
  {
    slug: "warszawa",
    name: "Sud Italia - Warszawa",
    city: "Warszawa",
    address: "ul. Nowy Świat 15, 00-029 Warszawa",
    coordinates: { lat: 52.2297, lng: 21.0122 },
    heroImage: "/images/locations/warszawa-hero.jpg",
    description:
      "Bringing a taste of Naples to Warsaw's vibrant Nowy Świat street. Our Warsaw food truck serves the same beloved recipes with locally-sourced produce and imported Italian specialties. From wood-fired pizza margherita to creamy burrata antipasti — it's a little piece of Southern Italy in the capital.",
    shortDescription:
      "A taste of Naples on Warsaw's iconic Nowy Świat street",
    hours: [
      { day: "Mon-Thu", open: "11:00", close: "21:00" },
      { day: "Fri-Sat", open: "11:00", close: "22:00" },
      { day: "Sun", open: "12:00", close: "20:00" },
    ],
    isActive: true,
    currency: "PLN",
  },
  {
    slug: "wroclaw",
    name: "Sud Italia - Wrocław",
    city: "Wrocław",
    address: "Rynek 1, 50-106 Wrocław",
    coordinates: { lat: 51.1079, lng: 17.0385 },
    heroImage: "/images/locations/wroclaw-hero.jpg",
    description:
      "Coming soon to Wrocław's beautiful Market Square. Sud Italia will bring its signature Neapolitan street food to Lower Silesia, offering the same commitment to quality and authenticity that our customers in Kraków and Warsaw have come to love.",
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

// Day-name → JS Date.getDay() index (Sun=0). Sud Italia's hours strings use
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
 * ranges right now. Used by the homepage hero kicker (V8 "Open now"
 * pill) and any future open-state UI that needs accuracy rather than
 * the `isActive` proxy LocationsGrid currently uses.
 */
export function isLocationOpenNow(location: Location, now: Date = new Date()): boolean {
  if (!location.isActive) return false;
  const jsDay = now.getDay();
  const minsNow = now.getHours() * 60 + now.getMinutes();
  return location.hours.some((h) => {
    if (!dayInRange(h.day, jsDay)) return false;
    const open = toMinutes(h.open);
    const close = toMinutes(h.close);
    // Hours don't wrap past midnight in the seed data, but handle the case
    // defensively for future overnight services (close <= open).
    if (close > open) return minsNow >= open && minsNow < close;
    return minsNow >= open || minsNow < close;
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
