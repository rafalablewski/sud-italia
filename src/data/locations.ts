import { Location } from "./types";

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
