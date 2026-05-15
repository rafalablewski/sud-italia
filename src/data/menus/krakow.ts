import { MenuItem } from "../types";

// Pricing follows audit §4.2 — Pizza ends in 9 (perceived value), premium
// pasta ends in 5 (perceived premium), espresso ends in 9 (impulse),
// desserts end in 0 (perceived quality). Margins are kept inside the bands
// in audit §4.1.

// LTO window for the anchor — surfaces in the card via isLimited/limitedUntil
// (the same fields used by the seasonal-specials feature). Re-set monthly
// when the Pizzaiolo rotates the truffle source; the menu doesn't break if
// the date is left in the past, the LTO chip just disappears.
const PIZZAIOLO_LTO_UNTIL = "2026-06-30";

export const krakowMenu: MenuItem[] = [
  // Pizza — Hero first, then profit driver, then standards, then anchor.
  // The order here is the canonical fallback when no menu-engineering sort
  // is in play (e.g. KDS lists, structured-data feed).
  {
    id: "krk-pizza-margherita",
    name: "Margherita",
    description:
      "San Marzano tomato sauce, fior di latte mozzarella, fresh basil, extra virgin olive oil",
    price: 2790,
    cost: 840,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "hero",
  },
  {
    id: "krk-pizza-quattro-formaggi",
    name: "Quattro Formaggi",
    description:
      "Mozzarella, gorgonzola, fontina, Parmigiano Reggiano, honey drizzle",
    price: 3390,
    cost: 1190,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "profit-driver",
  },
  {
    id: "krk-pizza-diavola",
    name: "Diavola",
    description:
      "San Marzano tomatoes, fior di latte, spicy salame calabrese, chili oil",
    price: 3190,
    cost: 1050,
    category: "pizza",
    tags: ["spicy"],
    available: true,
  },
  {
    id: "krk-pizza-prosciutto",
    name: "Prosciutto e Rucola",
    description:
      "Fior di latte, prosciutto crudo di Parma, wild arugula, shaved Parmigiano, olive oil",
    price: 3490,
    cost: 1260,
    category: "pizza",
    tags: [],
    available: true,
  },
  {
    id: "krk-pizza-ortolana",
    name: "Ortolana",
    description:
      "Grilled zucchini, eggplant, bell peppers, cherry tomatoes, mozzarella, basil pesto",
    price: 3090,
    cost: 930,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-pizza-pizzaiolo",
    name: "Pizza del Pizzaiolo",
    description:
      "Black truffle, buffalo mozzarella DOP, San Marzano tomato whisper, 24-month Parmigiano, olive oil. The Pizzaiolo's signature — limited monthly batch.",
    price: 4790,
    cost: 1720,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "anchor",
    isLimited: true,
    limitedUntil: PIZZAIOLO_LTO_UNTIL,
  },

  // Pasta — premium ends in 5 (Carbonara, Bolognese, profit-driver Pesto),
  // standard ends in 9 (Arrabbiata).
  {
    id: "krk-pasta-carbonara",
    name: "Spaghetti Carbonara",
    description:
      "Guanciale, egg yolk, Pecorino Romano, black pepper — the authentic Roman way",
    price: 2895,
    cost: 870,
    category: "pasta",
    tags: [],
    available: true,
  },
  {
    id: "krk-pasta-arrabbiata",
    name: "Penne Arrabbiata",
    description:
      "San Marzano tomato sauce, garlic, peperoncino, fresh parsley",
    price: 2390,
    cost: 600,
    category: "pasta",
    tags: ["vegan", "spicy"],
    available: true,
  },
  {
    id: "krk-pasta-pesto",
    name: "Linguine al Pesto",
    description:
      "Fresh Genovese basil pesto, pine nuts, Parmigiano, extra virgin olive oil",
    price: 2695,
    cost: 810,
    category: "pasta",
    tags: ["vegetarian"],
    available: true,
    menuRole: "profit-driver",
  },
  {
    id: "krk-pasta-bolognese",
    name: "Tagliatelle Bolognese",
    description:
      "Slow-cooked ragù with beef and pork, San Marzano tomatoes, fresh tagliatelle",
    price: 2995,
    cost: 1050,
    category: "pasta",
    tags: [],
    available: true,
  },

  // Antipasti
  {
    id: "krk-anti-bruschetta",
    name: "Bruschetta Classica",
    description:
      "Toasted ciabatta, diced tomatoes, garlic, fresh basil, olive oil",
    price: 1590,
    cost: 400,
    category: "antipasti",
    tags: ["vegan"],
    available: true,
  },
  {
    id: "krk-anti-burrata",
    name: "Burrata con Pomodorini",
    description:
      "Creamy burrata, cherry tomatoes, basil, aged balsamic, olive oil",
    price: 2195,
    cost: 770,
    category: "antipasti",
    tags: ["vegetarian", "gluten-free"],
    available: true,
  },
  {
    id: "krk-anti-arancini",
    name: "Arancini (3 pcs)",
    description:
      "Crispy Sicilian rice balls stuffed with ragù and mozzarella, served with marinara",
    price: 1790,
    cost: 540,
    category: "antipasti",
    tags: [],
    available: true,
  },

  // Panini
  {
    id: "krk-panini-caprese",
    name: "Panino Caprese",
    description:
      "Fresh mozzarella, tomato, basil, olive oil on ciabatta",
    price: 1990,
    cost: 600,
    category: "panini",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-panini-salame",
    name: "Panino Milano",
    description:
      "Salame Milano, provolone, roasted peppers, arugula on focaccia",
    price: 2290,
    cost: 760,
    category: "panini",
    tags: [],
    available: true,
  },

  // Drinks — espresso ends in 9 (impulse). Espresso is also a profit driver
  // surfaced via the upsell engine, and gets the "Pizzaiolo's Choice" badge.
  {
    id: "krk-drink-limonata",
    name: "Limonata Fresca",
    description: "House-made Sicilian lemonade with fresh mint",
    price: 1190,
    cost: 240,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-aranciata",
    name: "Aranciata San Pellegrino",
    description: "Classic Italian sparkling orange drink",
    price: 990,
    cost: 300,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-water",
    name: "Acqua Minerale",
    description: "Still or sparkling mineral water (500ml)",
    price: 590,
    cost: 100,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-espresso",
    name: "Espresso",
    description: "Italian-roasted espresso shot",
    price: 790,
    cost: 120,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
    menuRole: "profit-driver",
  },

  // Desserts — keep ending in 0 (perceived quality).
  {
    id: "krk-dessert-tiramisu",
    name: "Tiramisù",
    description:
      "Classic mascarpone cream, espresso-soaked savoiardi, cocoa powder",
    price: 1800,
    cost: 540,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-dessert-cannoli",
    name: "Cannoli Siciliani (2 pcs)",
    description:
      "Crispy pastry shells filled with sweet ricotta, chocolate chips, pistachios",
    price: 1600,
    cost: 480,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-dessert-panna-cotta",
    name: "Panna Cotta",
    description: "Vanilla bean panna cotta with wild berry coulis",
    price: 1500,
    cost: 375,
    category: "desserts",
    tags: ["vegetarian", "gluten-free"],
    available: true,
  },
];
