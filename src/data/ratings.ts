// Simulated ratings data — in production, this would come from a database

interface ItemRating {
  rating: number; // 1-5
  count: number;  // number of reviews
}

const RATINGS: Record<string, ItemRating> = {
  // Krakow
  "krk-pizza-margherita": { rating: 4.8, count: 342 },
  "krk-pizza-diavola": { rating: 4.7, count: 218 },
  "krk-pizza-prosciutto": { rating: 4.6, count: 156 },
  "krk-pizza-quattro-formaggi": { rating: 4.9, count: 289 },
  "krk-pizza-ortolana": { rating: 4.4, count: 98 },
  "krk-pasta-carbonara": { rating: 4.8, count: 267 },
  "krk-pasta-arrabbiata": { rating: 4.3, count: 89 },
  "krk-pasta-pesto": { rating: 4.5, count: 134 },
  "krk-pasta-bolognese": { rating: 4.6, count: 178 },
  "krk-anti-bruschetta": { rating: 4.4, count: 112 },
  "krk-anti-burrata": { rating: 4.9, count: 201 },
  "krk-anti-arancini": { rating: 4.5, count: 145 },
  "krk-panini-caprese": { rating: 4.3, count: 67 },
  "krk-panini-salame": { rating: 4.4, count: 82 },
  "krk-drink-limonata": { rating: 4.6, count: 198 },
  "krk-drink-aranciata": { rating: 4.2, count: 156 },
  "krk-drink-water": { rating: 4.0, count: 45 },
  "krk-drink-espresso": { rating: 4.5, count: 123 },
  "krk-dessert-tiramisu": { rating: 4.9, count: 312 },
  "krk-dessert-cannoli": { rating: 4.7, count: 189 },
  "krk-dessert-panna-cotta": { rating: 4.6, count: 134 },

  // Warsaw
  "waw-pizza-margherita": { rating: 4.7, count: 278 },
  "waw-pizza-diavola": { rating: 4.6, count: 189 },
  "waw-pizza-prosciutto": { rating: 4.5, count: 134 },
  "waw-pizza-quattro-formaggi": { rating: 4.8, count: 245 },
  "waw-pizza-napoli": { rating: 4.4, count: 112 },
  "waw-pizza-bufala": { rating: 4.9, count: 267 },
  "waw-pasta-carbonara": { rating: 4.7, count: 223 },
  "waw-pasta-cacio-pepe": { rating: 4.8, count: 178 },
  "waw-pasta-amatriciana": { rating: 4.5, count: 98 },
  "waw-pasta-pesto": { rating: 4.4, count: 112 },
  "waw-anti-bruschetta": { rating: 4.3, count: 89 },
  "waw-anti-burrata": { rating: 4.8, count: 167 },
  "waw-anti-calamari": { rating: 4.6, count: 134 },
  "waw-panini-porchetta": { rating: 4.5, count: 78 },
  "waw-panini-caprese": { rating: 4.3, count: 56 },
  "waw-drink-limonata": { rating: 4.5, count: 167 },
  "waw-drink-aranciata": { rating: 4.1, count: 123 },
  "waw-drink-water": { rating: 4.0, count: 34 },
  "waw-drink-espresso": { rating: 4.4, count: 98 },
  "waw-dessert-tiramisu": { rating: 4.8, count: 256 },
  "waw-dessert-cannoli": { rating: 4.6, count: 156 },
};

export function getItemRating(itemId: string): ItemRating | null {
  return RATINGS[itemId] || null;
}
