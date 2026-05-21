// Lightweight i18n system for Sud Italia.
//
// Supported locales:
//   - pl    Polish (default — Krakow / Warsaw operations)
//   - en    English (international)
//   - de    German (DACH expansion + tourists)
//   - en-SG Singapore English (Singapore expansion / SGD pairing)

export type Locale = "pl" | "en" | "de" | "en-SG";

export const ALL_LOCALES: Locale[] = ["pl", "en", "de", "en-SG"];

export const LOCALE_META: Record<
  Locale,
  { label: string; nativeLabel: string; flag: string }
> = {
  pl: { label: "Polish", nativeLabel: "Polski", flag: "🇵🇱" },
  en: { label: "English", nativeLabel: "English", flag: "🇬🇧" },
  de: { label: "German", nativeLabel: "Deutsch", flag: "🇩🇪" },
  "en-SG": { label: "Singapore English", nativeLabel: "Singapore English", flag: "🇸🇬" },
};

const translations: Record<string, Record<Locale, string>> = {
  // Navigation
  "nav.locations": { pl: "Lokalizacje", en: "Locations", de: "Standorte", "en-SG": "Outlets" },
  "nav.about": { pl: "O nas", en: "About", de: "Über uns", "en-SG": "About" },
  "nav.order": { pl: "Zamów", en: "Order", de: "Bestellen", "en-SG": "Order" },

  // Hero
  "hero.tagline": {
    pl: "Autentyczne Włoskie Street Food",
    en: "Authentic Italian Street Food",
    de: "Authentisches italienisches Street Food",
    "en-SG": "Authentic Italian Street Food",
  },
  "hero.title.taste": { pl: "Smak", en: "A Taste of", de: "Ein Geschmack von", "en-SG": "A Taste of" },
  "hero.title.southern": {
    pl: "Południowych Włoch",
    en: "Southern Italy",
    de: "Süditalien",
    "en-SG": "Southern Italy",
  },
  "hero.title.streets": {
    pl: "na ulicach",
    en: "on the Streets of",
    de: "auf den Straßen von",
    "en-SG": "on the streets of",
  },
  "hero.title.poland": { pl: "Polski", en: "Poland", de: "Polen", "en-SG": "Poland" },
  "hero.subtitle": {
    pl: "Neapolitańska pizza, świeży makaron i klasyczne włoskie street food — przygotowane z miłością.",
    en: "Neapolitan pizza, fresh handmade pasta, and classic Italian street food — crafted with love.",
    de: "Neapolitanische Pizza, frische handgemachte Pasta und klassisches italienisches Street Food — mit Liebe zubereitet.",
    "en-SG":
      "Neapolitan pizza, fresh handmade pasta, and classic Italian street food — made with love, shiok!",
  },
  "hero.order_in": { pl: "Zamów w", en: "Order in", de: "Bestellen in", "en-SG": "Order in" },
  "hero.our_story": { pl: "Nasza Historia", en: "Our Story", de: "Unsere Geschichte", "en-SG": "Our Story" },
  "hero.where_order": {
    pl: "Skąd chcesz zamówić?",
    en: "Where would you like to order from?",
    de: "Von wo möchten Sie bestellen?",
    "en-SG": "Which outlet you ordering from?",
  },
  "hero.open": { pl: "Otwarte", en: "Open", de: "Geöffnet", "en-SG": "Open" },

  // Menu
  "menu.search": {
    pl: "Szukaj pizzy, makaronu, napojów...",
    en: "Search for pizza, pasta, drinks...",
    de: "Suche nach Pizza, Pasta, Getränken...",
    "en-SG": "Search pizza, pasta, drinks lah...",
  },
  "menu.results_for": { pl: "wyników dla", en: "results for", de: "Ergebnisse für", "en-SG": "results for" },
  "menu.no_items": {
    pl: "Brak dostępnych pozycji w menu.",
    en: "No menu items available right now.",
    de: "Derzeit sind keine Menüpunkte verfügbar.",
    "en-SG": "No items available now, sorry!",
  },
  "menu.no_match": {
    pl: "Brak wyników",
    en: "No items match your search",
    de: "Keine Ergebnisse",
    "en-SG": "Cannot find anything matching",
  },
  "menu.clear_search": {
    pl: "Wyczyść wyszukiwanie",
    en: "Clear search",
    de: "Suche löschen",
    "en-SG": "Clear search",
  },
  "menu.add": { pl: "Dodaj", en: "Add", de: "Hinzufügen", "en-SG": "Add" },
  "menu.in_cart": { pl: "w koszyku", en: "in cart", de: "im Warenkorb", "en-SG": "in cart" },
  "menu.added": { pl: "Dodano!", en: "Added!", de: "Hinzugefügt!", "en-SG": "Added!" },
  "menu.surprise": {
    pl: "Nie możesz się zdecydować?",
    en: "Can't decide?",
    de: "Können Sie sich nicht entscheiden?",
    "en-SG": "Cannot decide?",
  },
  "menu.surprise_sub": {
    pl: "Pozwól nam wybrać za Ciebie!",
    en: "Let us pick something for you!",
    de: "Lass uns etwas für Sie auswählen!",
    "en-SG": "Let us pick one for you!",
  },
  "menu.surprise_btn": {
    pl: "Zaskocz mnie!",
    en: "Surprise Me!",
    de: "Überrasche mich!",
    "en-SG": "Surprise me!",
  },
  "menu.picking": { pl: "Wybieram...", en: "Picking...", de: "Wähle aus...", "en-SG": "Choosing..." },

  // Cart
  "cart.title": { pl: "Twoje Zamówienie", en: "Your Order", de: "Ihre Bestellung", "en-SG": "Your Order" },
  "cart.empty": {
    pl: "Twój koszyk jest pusty",
    en: "Your cart is empty",
    de: "Ihr Warenkorb ist leer",
    "en-SG": "Your cart is empty",
  },
  "cart.empty_sub": {
    pl: "Dodaj pozycje z menu",
    en: "Add items from the menu to get started",
    de: "Fügen Sie Artikel aus dem Menü hinzu",
    "en-SG": "Add items from the menu to start",
  },
  "cart.view": { pl: "Zobacz koszyk", en: "View Cart", de: "Warenkorb ansehen", "en-SG": "View Cart" },
  "cart.total": { pl: "Razem", en: "Total", de: "Gesamt", "en-SG": "Total" },
  "cart.clear": {
    pl: "Wyczyść koszyk",
    en: "Clear cart",
    de: "Warenkorb leeren",
    "en-SG": "Clear cart",
  },
  "cart.complete_meal": {
    pl: "Skompletuj posiłek",
    en: "Complete your meal",
    de: "Mahlzeit vervollständigen",
    "en-SG": "Complete your meal",
  },
  "cart.how_order": {
    pl: "Jak chcesz odebrać zamówienie?",
    en: "How would you like your order?",
    de: "Wie möchten Sie Ihre Bestellung?",
    "en-SG": "How you want your order?",
  },
  "cart.takeout": { pl: "Na wynos", en: "Takeout", de: "Zum Mitnehmen", "en-SG": "Takeaway" },
  "cart.delivery": { pl: "Dostawa", en: "Delivery", de: "Lieferung", "en-SG": "Delivery" },
  "cart.delivery_addr": {
    pl: "Adres dostawy",
    en: "Delivery address",
    de: "Lieferadresse",
    "en-SG": "Delivery address",
  },
  "cart.your_name": { pl: "Twoje imię", en: "Your name", de: "Ihr Name", "en-SG": "Your name" },
  "cart.phone": {
    pl: "Numer telefonu",
    en: "Phone number",
    de: "Telefonnummer",
    "en-SG": "Phone number",
  },
  "cart.phone_error": {
    pl: "Podaj prawidłowy numer telefonu",
    en: "Please enter a valid phone number",
    de: "Bitte geben Sie eine gültige Telefonnummer ein",
    "en-SG": "Please enter a valid phone number",
  },
  "cart.pay": { pl: "Zapłać", en: "Pay", de: "Bezahlen", "en-SG": "Pay" },
  "cart.select_slot": {
    pl: "Wybierz godzinę",
    en: "Select a time slot",
    de: "Wählen Sie eine Zeit",
    "en-SG": "Pick a time slot",
  },
  "cart.enter_address": {
    pl: "Podaj adres dostawy",
    en: "Enter delivery address",
    de: "Lieferadresse eingeben",
    "en-SG": "Enter delivery address",
  },
  "cart.enter_details": {
    pl: "Podaj imię i telefon",
    en: "Enter name & phone to order",
    de: "Name und Telefon eingeben",
    "en-SG": "Enter name & phone to order",
  },
  "cart.processing": {
    pl: "Przetwarzanie...",
    en: "Processing...",
    de: "Verarbeitung...",
    "en-SG": "Processing...",
  },

  // Delivery
  "delivery.free": {
    pl: "Darmowa dostawa odblokowana!",
    en: "Free delivery unlocked!",
    de: "Kostenlose Lieferung freigeschaltet!",
    "en-SG": "Free delivery unlocked!",
  },
  "delivery.add_more": { pl: "Dodaj", en: "Add", de: "Hinzufügen", "en-SG": "Add" },
  "delivery.for_free": {
    pl: "do darmowej dostawy",
    en: "for free delivery",
    de: "für kostenlose Lieferung",
    "en-SG": "for free delivery",
  },

  // Order confirmation
  "order.confirmed": {
    pl: "Zamówienie Potwierdzone!",
    en: "Order Confirmed!",
    de: "Bestellung bestätigt!",
    "en-SG": "Order Confirmed!",
  },
  "order.thanks": {
    pl: "Dziękujemy za zamówienie",
    en: "Thank you for your order",
    de: "Vielen Dank für Ihre Bestellung",
    "en-SG": "Thank you for your order",
  },
  "order.id": { pl: "Nr zamówienia", en: "Order ID", de: "Bestellnummer", "en-SG": "Order ID" },
  "order.live": {
    pl: "Śledzenie na żywo",
    en: "Live tracking",
    de: "Live-Verfolgung",
    "en-SG": "Live tracking",
  },
  "order.pickup_at": {
    pl: "Odbierz zamówienie w",
    en: "Pick up your order at",
    de: "Holen Sie Ihre Bestellung ab in",
    "en-SG": "Pick up your order at",
  },
  "order.again": {
    pl: "Zamów ponownie",
    en: "Order Again",
    de: "Erneut bestellen",
    "en-SG": "Order Again",
  },
  "order.share": { pl: "Udostępnij", en: "Share Order", de: "Bestellung teilen", "en-SG": "Share Order" },
  "order.home": { pl: "Strona główna", en: "Back to Home", de: "Zur Startseite", "en-SG": "Back to Home" },
  "order.summary": {
    pl: "Podsumowanie zamówienia",
    en: "Order summary",
    de: "Bestellübersicht",
    "en-SG": "Order summary",
  },
  "order.estimated": {
    pl: "Szacowany czas",
    en: "Estimated time",
    de: "Geschätzte Zeit",
    "en-SG": "Estimated time",
  },

  // Loyalty
  "loyalty.title": {
    pl: "Program Lojalnościowy",
    en: "Loyalty Program",
    de: "Treueprogramm",
    "en-SG": "Loyalty Programme",
  },
  "loyalty.points": { pl: "punktów", en: "points", de: "Punkte", "en-SG": "points" },
  "loyalty.earn": {
    pl: "Zbieraj punkty za każde zamówienie!",
    en: "Earn points with every order!",
    de: "Sammeln Sie Punkte bei jeder Bestellung!",
    "en-SG": "Earn points with every order!",
  },
  "loyalty.redeem": {
    pl: "Wymień na nagrody",
    en: "Redeem for rewards",
    de: "Für Prämien einlösen",
    "en-SG": "Redeem for rewards",
  },

  // Footer
  "footer.tagline": {
    pl: "Autentyczne włoskie street food na ulicach Polski.",
    en: "Authentic Italian street food on the streets of Poland.",
    de: "Authentisches italienisches Street Food auf den Straßen Polens.",
    "en-SG": "Authentic Italian street food on the streets of Poland.",
  },
  "footer.follow": { pl: "Obserwuj nas", en: "Follow us", de: "Folgen Sie uns", "en-SG": "Follow us" },
  "footer.locations": { pl: "Lokalizacje", en: "Locations", de: "Standorte", "en-SG": "Outlets" },
  "footer.rights": {
    pl: "Wszelkie prawa zastrzeżone.",
    en: "All rights reserved.",
    de: "Alle Rechte vorbehalten.",
    "en-SG": "All rights reserved.",
  },

  // Ratings
  "rating.rate": { pl: "Oceń", en: "Rate", de: "Bewerten", "en-SG": "Rate" },
  "rating.reviews": { pl: "opinii", en: "reviews", de: "Bewertungen", "en-SG": "reviews" },
};

// Default locale
let currentLocale: Locale = "pl";

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof window !== "undefined") {
    localStorage.setItem("sud-italia-locale", locale);
    document.documentElement.lang = locale;
  }
}

export function getLocale(): Locale {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("sud-italia-locale") as Locale | null;
    if (saved && ALL_LOCALES.includes(saved)) return saved;
  }
  return currentLocale;
}

export function t(key: string, locale?: Locale): string {
  const l = locale || (typeof window !== "undefined" ? getLocale() : currentLocale);
  return translations[key]?.[l] || translations[key]?.["en"] || key;
}
