// Lightweight i18n system for Sud Italia
// Supports Polish (pl) and English (en)

export type Locale = "pl" | "en";

const translations: Record<string, Record<Locale, string>> = {
  // Navigation
  "nav.locations": { pl: "Lokalizacje", en: "Locations" },
  "nav.about": { pl: "O nas", en: "About" },
  "nav.order": { pl: "Zamów", en: "Order" },

  // Hero
  "hero.tagline": { pl: "Autentyczne Włoskie Street Food", en: "Authentic Italian Street Food" },
  "hero.title.taste": { pl: "Smak", en: "A Taste of" },
  "hero.title.southern": { pl: "Południowych Włoch", en: "Southern Italy" },
  "hero.title.streets": { pl: "na ulicach", en: "on the Streets of" },
  "hero.title.poland": { pl: "Polski", en: "Poland" },
  "hero.subtitle": {
    pl: "Neapolitańska pizza, świeży makaron i klasyczne włoskie street food — przygotowane z miłością.",
    en: "Neapolitan pizza, fresh handmade pasta, and classic Italian street food — crafted with love.",
  },
  "hero.order_in": { pl: "Zamów w", en: "Order in" },
  "hero.our_story": { pl: "Nasza Historia", en: "Our Story" },
  "hero.where_order": { pl: "Skąd chcesz zamówić?", en: "Where would you like to order from?" },
  "hero.open": { pl: "Otwarte", en: "Open" },

  // Menu
  "menu.search": { pl: "Szukaj pizzy, makaronu, napojów...", en: "Search for pizza, pasta, drinks..." },
  "menu.results_for": { pl: "wyników dla", en: "results for" },
  "menu.no_items": { pl: "Brak dostępnych pozycji w menu.", en: "No menu items available right now." },
  "menu.no_match": { pl: "Brak wyników", en: "No items match your search" },
  "menu.clear_search": { pl: "Wyczyść wyszukiwanie", en: "Clear search" },
  "menu.add": { pl: "Dodaj", en: "Add" },
  "menu.in_cart": { pl: "w koszyku", en: "in cart" },
  "menu.added": { pl: "Dodano!", en: "Added!" },
  "menu.surprise": { pl: "Nie możesz się zdecydować?", en: "Can't decide?" },
  "menu.surprise_sub": { pl: "Pozwól nam wybrać za Ciebie!", en: "Let us pick something for you!" },
  "menu.surprise_btn": { pl: "Zaskocz mnie!", en: "Surprise Me!" },
  "menu.picking": { pl: "Wybieram...", en: "Picking..." },

  // Cart
  "cart.title": { pl: "Twoje Zamówienie", en: "Your Order" },
  "cart.empty": { pl: "Twój koszyk jest pusty", en: "Your cart is empty" },
  "cart.empty_sub": { pl: "Dodaj pozycje z menu", en: "Add items from the menu to get started" },
  "cart.view": { pl: "Zobacz koszyk", en: "View Cart" },
  "cart.total": { pl: "Razem", en: "Total" },
  "cart.clear": { pl: "Wyczyść koszyk", en: "Clear cart" },
  "cart.complete_meal": { pl: "Skompletuj posiłek", en: "Complete your meal" },
  "cart.how_order": { pl: "Jak chcesz odebrać zamówienie?", en: "How would you like your order?" },
  "cart.takeout": { pl: "Na wynos", en: "Takeout" },
  "cart.delivery": { pl: "Dostawa", en: "Delivery" },
  "cart.delivery_addr": { pl: "Adres dostawy", en: "Delivery address" },
  "cart.your_name": { pl: "Twoje imię", en: "Your name" },
  "cart.phone": { pl: "Numer telefonu", en: "Phone number" },
  "cart.phone_error": { pl: "Podaj prawidłowy numer telefonu", en: "Please enter a valid phone number" },
  "cart.pay": { pl: "Zapłać", en: "Pay" },
  "cart.select_slot": { pl: "Wybierz godzinę", en: "Select a time slot" },
  "cart.enter_address": { pl: "Podaj adres dostawy", en: "Enter delivery address" },
  "cart.enter_details": { pl: "Podaj imię i telefon", en: "Enter name & phone to order" },
  "cart.processing": { pl: "Przetwarzanie...", en: "Processing..." },

  // Delivery
  "delivery.free": { pl: "Darmowa dostawa odblokowana!", en: "Free delivery unlocked!" },
  "delivery.add_more": { pl: "Dodaj", en: "Add" },
  "delivery.for_free": { pl: "do darmowej dostawy", en: "for free delivery" },

  // Order confirmation
  "order.confirmed": { pl: "Zamówienie Potwierdzone!", en: "Order Confirmed!" },
  "order.thanks": { pl: "Dziękujemy za zamówienie", en: "Thank you for your order" },
  "order.id": { pl: "Nr zamówienia", en: "Order ID" },
  "order.live": { pl: "Śledzenie na żywo", en: "Live tracking" },
  "order.pickup_at": { pl: "Odbierz zamówienie w", en: "Pick up your order at" },
  "order.again": { pl: "Zamów ponownie", en: "Order Again" },
  "order.share": { pl: "Udostępnij", en: "Share Order" },
  "order.home": { pl: "Strona główna", en: "Back to Home" },
  "order.summary": { pl: "Podsumowanie zamówienia", en: "Order summary" },
  "order.estimated": { pl: "Szacowany czas", en: "Estimated time" },

  // Loyalty
  "loyalty.title": { pl: "Program Lojalnościowy", en: "Loyalty Program" },
  "loyalty.points": { pl: "punktów", en: "points" },
  "loyalty.earn": { pl: "Zbieraj punkty za każde zamówienie!", en: "Earn points with every order!" },
  "loyalty.redeem": { pl: "Wymień na nagrody", en: "Redeem for rewards" },

  // Footer
  "footer.tagline": { pl: "Autentyczne włoskie street food na ulicach Polski.", en: "Authentic Italian street food on the streets of Poland." },
  "footer.follow": { pl: "Obserwuj nas", en: "Follow us" },
  "footer.locations": { pl: "Lokalizacje", en: "Locations" },
  "footer.rights": { pl: "Wszelkie prawa zastrzeżone.", en: "All rights reserved." },

  // Ratings
  "rating.rate": { pl: "Oceń", en: "Rate" },
  "rating.reviews": { pl: "opinii", en: "reviews" },
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
    if (saved === "pl" || saved === "en") return saved;
  }
  return currentLocale;
}

export function t(key: string, locale?: Locale): string {
  const l = locale || (typeof window !== "undefined" ? getLocale() : currentLocale);
  return translations[key]?.[l] || translations[key]?.["en"] || key;
}
