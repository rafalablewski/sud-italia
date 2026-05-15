import { MenuItem } from "../types";

// Pricing follows audit §4.2 — Pizza ends in 9, premium pasta ends in 5,
// espresso ends in 9, desserts end in 0. Warszawa list runs ~7-10% above
// Kraków, with the Pizzaiolo anchor at PLN 52.90 (vs Kraków's PLN 47.90)
// to range-extend perception against the highest standard pizza (Bufala
// PLN 37.90).
const PIZZAIOLO_LTO_UNTIL = "2026-06-30";

export const warszawaMenu: MenuItem[] = [
  // Pizza
  {
    id: "waw-pizza-margherita",
    name: "Margherita",
    description:
      "San Marzano tomato sauce, fior di latte mozzarella, fresh basil, extra virgin olive oil",
    price: 2990,
    cost: 900,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "hero",
  },
  {
    id: "waw-pizza-quattro-formaggi",
    name: "Quattro Formaggi",
    description:
      "Mozzarella, gorgonzola, fontina, Parmigiano Reggiano, honey drizzle",
    price: 3590,
    cost: 1260,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "profit-driver",
  },
  {
    id: "waw-pizza-diavola",
    name: "Diavola",
    description:
      "San Marzano tomatoes, fior di latte, spicy salame calabrese, chili oil",
    price: 3390,
    cost: 1120,
    category: "pizza",
    tags: ["spicy"],
    available: true,
  },
  {
    id: "waw-pizza-prosciutto",
    name: "Prosciutto e Rucola",
    description:
      "Fior di latte, prosciutto crudo di Parma, wild arugula, shaved Parmigiano, olive oil",
    price: 3690,
    cost: 1330,
    category: "pizza",
    tags: [],
    available: true,
  },
  {
    id: "waw-pizza-napoli",
    name: "Napoli",
    description:
      "San Marzano tomatoes, mozzarella, anchovies, capers, oregano, olive oil",
    price: 3290,
    cost: 990,
    category: "pizza",
    tags: [],
    available: true,
  },
  {
    id: "waw-pizza-bufala",
    name: "Bufala",
    description:
      "San Marzano tomatoes, buffalo mozzarella DOP, fresh basil, olive oil",
    price: 3790,
    cost: 1370,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-pizza-pizzaiolo",
    name: "Pizza del Pizzaiolo",
    description:
      "Black truffle, buffalo mozzarella DOP, San Marzano tomato whisper, 24-month Parmigiano, olive oil. The Pizzaiolo's signature — limited monthly batch.",
    price: 5290,
    cost: 1900,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "anchor",
    isLimited: true,
    limitedUntil: PIZZAIOLO_LTO_UNTIL,
  },

  // Pasta — premium ends in 5
  {
    id: "waw-pasta-carbonara",
    name: "Spaghetti Carbonara",
    description:
      "Guanciale, egg yolk, Pecorino Romano, black pepper — the authentic Roman way",
    price: 3095,
    cost: 930,
    category: "pasta",
    tags: [],
    available: true,
  },
  {
    id: "waw-pasta-cacio-pepe",
    name: "Cacio e Pepe",
    description:
      "Tonnarelli pasta, Pecorino Romano, freshly cracked black pepper",
    price: 2795,
    cost: 700,
    category: "pasta",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-pasta-amatriciana",
    name: "Bucatini all'Amatriciana",
    description:
      "Guanciale, San Marzano tomatoes, Pecorino Romano, chili flakes",
    price: 2995,
    cost: 900,
    category: "pasta",
    tags: ["spicy"],
    available: true,
  },
  {
    id: "waw-pasta-pesto",
    name: "Linguine al Pesto",
    description:
      "Fresh Genovese basil pesto, pine nuts, Parmigiano, extra virgin olive oil",
    price: 2895,
    cost: 870,
    category: "pasta",
    tags: ["vegetarian"],
    available: true,
    menuRole: "profit-driver",
  },

  // Antipasti
  {
    id: "waw-anti-bruschetta",
    name: "Bruschetta Classica",
    description:
      "Toasted ciabatta, diced tomatoes, garlic, fresh basil, olive oil",
    price: 1790,
    cost: 450,
    category: "antipasti",
    tags: ["vegan"],
    available: true,
  },
  {
    id: "waw-anti-burrata",
    name: "Burrata con Prosciutto",
    description:
      "Creamy burrata, prosciutto di Parma, grilled peaches, arugula, balsamic glaze",
    price: 2795,
    cost: 980,
    category: "antipasti",
    tags: ["gluten-free"],
    available: true,
  },
  {
    id: "waw-anti-calamari",
    name: "Calamari Fritti",
    description:
      "Crispy fried calamari rings with lemon aioli and marinara sauce",
    price: 2390,
    cost: 720,
    category: "antipasti",
    tags: [],
    available: true,
  },

  // Panini
  {
    id: "waw-panini-porchetta",
    name: "Panino Porchetta",
    description:
      "Slow-roasted porchetta, broccoli rabe, provolone, chili oil on ciabatta",
    price: 2590,
    cost: 860,
    category: "panini",
    tags: ["spicy"],
    available: true,
  },
  {
    id: "waw-panini-caprese",
    name: "Panino Caprese",
    description:
      "Fresh mozzarella, tomato, basil, olive oil on ciabatta",
    price: 2190,
    cost: 660,
    category: "panini",
    tags: ["vegetarian"],
    available: true,
  },

  // Drinks — espresso ends in 9 (impulse)
  {
    id: "waw-drink-limonata",
    name: "Limonata Fresca",
    description: "House-made Sicilian lemonade with fresh mint",
    price: 1390,
    cost: 280,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-aranciata",
    name: "Aranciata San Pellegrino",
    description: "Classic Italian sparkling orange drink",
    price: 1190,
    cost: 360,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-water",
    name: "Acqua Minerale",
    description: "Still or sparkling mineral water (500ml)",
    price: 690,
    cost: 120,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-espresso",
    name: "Espresso",
    description: "Italian-roasted espresso shot",
    price: 890,
    cost: 135,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
    menuRole: "profit-driver",
  },

  // Desserts — end in 0 (perceived quality)
  {
    id: "waw-dessert-tiramisu",
    name: "Tiramisù",
    description:
      "Classic mascarpone cream, espresso-soaked savoiardi, cocoa powder",
    price: 2000,
    cost: 600,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-dessert-cannoli",
    name: "Cannoli Siciliani (2 pcs)",
    description:
      "Crispy pastry shells filled with sweet ricotta, chocolate chips, pistachios",
    price: 1800,
    cost: 540,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
  },
];
