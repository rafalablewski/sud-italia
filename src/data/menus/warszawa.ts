import { MenuItem } from "../types";

// Pricing follows audit §4.2 — Pizza ends in 9, premium pasta ends in 5,
// espresso ends in 9, desserts end in 0. Warszawa list runs ~7-10% above
// Kraków, with the Pizzaiolo anchor at PLN 54.90 (vs Kraków's PLN 49.90)
// to range-extend perception against the highest standard pizza (Bufala
// PLN 37.90), and the Tartufata Reale top anchor at PLN 89.90.
const PIZZAIOLO_LTO_UNTIL = "2026-06-30";
const TARTUFATA_LTO_UNTIL = "2026-08-31";

export const warszawaMenu: MenuItem[] = [
  // Pizza
  {
    id: "waw-pizza-margherita",
    name: "Margherita",
    description:
      "San Marzano tomato sauce, fior di latte mozzarella, fresh basil, extra virgin olive oil",
    price: 2990,
    cost: 880,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "hero",
    modifierGroups: [
      {
        id: "crust",
        label: "Crust",
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: "standard", label: "Neapolitan (standard)", priceDelta: 0 },
          { id: "sourdough", label: "48h sourdough", priceDelta: 600, costDelta: 140 },
          { id: "gluten-free", label: "Gluten-free", priceDelta: 600, costDelta: 200, flagOnKds: true },
        ],
      },
      {
        id: "extras",
        label: "Premium toppings",
        minSelections: 0,
        maxSelections: 3,
        options: [
          { id: "buffalo-mozz", label: "Buffalo mozzarella DOP", priceDelta: 1000, costDelta: 360, flagOnKds: true },
          { id: "extra-cheese", label: "Extra cheese", priceDelta: 700, costDelta: 230 },
          { id: "truffle-oil", label: "Truffle oil drizzle", priceDelta: 900, costDelta: 250 },
          { id: "prosciutto", label: "Prosciutto di Parma", priceDelta: 1400, costDelta: 540, flagOnKds: true },
        ],
      },
    ],
  },
  {
    id: "waw-pizza-quattro-formaggi",
    name: "Quattro Formaggi",
    description:
      "Mozzarella, gorgonzola, fontina, Parmigiano Reggiano, honey drizzle",
    price: 3590,
    cost: 1230,
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
    price: 3490,
    cost: 1100,
    category: "pizza",
    tags: ["spicy"],
    available: true,
  },
  {
    id: "waw-pizza-prosciutto",
    name: "Prosciutto e Rucola",
    description:
      "Fior di latte, prosciutto crudo di Parma, wild arugula, shaved Parmigiano, olive oil",
    price: 3790,
    cost: 1310,
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
    cost: 970,
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
    cost: 1340,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-pizza-pizzaiolo",
    name: "Pizza del Pizzaiolo",
    description:
      "Black truffle, buffalo mozzarella DOP, San Marzano tomato whisper, 24-month Parmigiano, olive oil. The Pizzaiolo's signature — limited monthly batch.",
    price: 5490,
    cost: 1830,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "anchor",
    isLimited: true,
    limitedUntil: PIZZAIOLO_LTO_UNTIL,
  },
  // Tartufata Reale — top-of-range anchor (audit §3.2). 80+ PLN.
  {
    id: "waw-pizza-tartufata",
    name: "Tartufata Reale",
    description:
      "Fresh shaved black truffle, 24-month Parmigiano, burrata di Andria, prosciutto di Parma DOP 18-month, San Marzano whisper, truffle oil. The chef's masterpiece — by reservation, very limited.",
    price: 8990,
    cost: 2620,
    category: "pizza",
    tags: [],
    available: true,
    menuRole: "anchor",
    isLimited: true,
    limitedUntil: TARTUFATA_LTO_UNTIL,
  },
  // Personal-size for solo / late-night.
  {
    id: "waw-pizza-personale",
    name: "Margherita Personale (8\")",
    description:
      "Solo-sized Margherita — same San Marzano, fior di latte, fresh basil. Ready in 6 minutes.",
    price: 1990,
    cost: 570,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-pizza-slice",
    name: "Slice (Margherita)",
    description:
      "One slice, reheated to order in 60 seconds. The late-night classic.",
    price: 1290,
    cost: 300,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },

  // Pasta — premium ends in 5
  {
    id: "waw-pasta-carbonara",
    name: "Spaghetti Carbonara",
    description:
      "Guanciale, egg yolk, Pecorino Romano, black pepper — the authentic Roman way",
    price: 3095,
    cost: 910,
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
    cost: 680,
    category: "pasta",
    tags: ["vegetarian"],
    available: true,
    menuRole: "profit-driver",
  },
  {
    id: "waw-pasta-amatriciana",
    name: "Bucatini all'Amatriciana",
    description:
      "Guanciale, San Marzano tomatoes, Pecorino Romano, chili flakes",
    price: 2995,
    cost: 880,
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
    cost: 850,
    category: "pasta",
    tags: ["vegetarian"],
    available: true,
  },

  // Antipasti
  {
    id: "waw-anti-bruschetta",
    name: "Bruschetta Classica",
    description:
      "Toasted ciabatta, diced tomatoes, garlic, fresh basil, olive oil",
    price: 1790,
    cost: 440,
    category: "antipasti",
    tags: ["vegan"],
    available: true,
  },
  // Garlic Bread — pizza-attach play.
  {
    id: "waw-anti-garlic-bread",
    name: "Garlic Bread",
    description:
      "Wood-fired pizza dough, garlic butter, fresh parsley, Parmigiano. Pulls apart.",
    price: 1090,
    cost: 240,
    category: "antipasti",
    tags: ["vegetarian"],
    available: true,
    menuRole: "profit-driver",
  },
  {
    id: "waw-anti-burrata",
    name: "Burrata con Prosciutto",
    description:
      "Creamy burrata, prosciutto di Parma, grilled peaches, arugula, balsamic glaze",
    price: 2795,
    cost: 960,
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
    cost: 700,
    category: "antipasti",
    tags: [],
    available: true,
  },

  // Panini — slimmer line for Warszawa; the panini slot is not a lead.
  {
    id: "waw-panini-porchetta",
    name: "Panino Porchetta",
    description:
      "Slow-roasted porchetta, broccoli rabe, provolone, chili oil on ciabatta",
    price: 2590,
    cost: 840,
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
    cost: 640,
    category: "panini",
    tags: ["vegetarian"],
    available: true,
  },

  // Drinks — espresso re-priced to PLN 10.90 (audit §0) to align with
  // Warszawa speciality-café benchmark (12–14 PLN). Limonata 1L unlocks
  // the Pizza Family Pack fixed bundle.
  {
    id: "waw-drink-espresso",
    name: "Espresso",
    description: "Italian-roasted espresso shot — Caffè Lavazza ¡Tierra! single-origin",
    price: 1090,
    cost: 155,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
    menuRole: "profit-driver",
  },
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
    id: "waw-drink-limonata-1l",
    name: "Limonata 1L",
    description: "Shareable 1L bottle of house-made Sicilian lemonade",
    price: 2390,
    cost: 440,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-aranciata",
    name: "Aranciata San Pellegrino",
    description: "Classic Italian sparkling orange drink",
    price: 1190,
    cost: 380,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-water",
    name: "Acqua Minerale",
    description: "Still or sparkling mineral water (500ml)",
    price: 690,
    cost: 130,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },

  // Desserts — end in 0 (perceived quality). Panna Cotta is the value-tier
  // default for sub-40 PLN carts; Tiramisù holds the premium-cart default.
  {
    id: "waw-dessert-tiramisu",
    name: "Tiramisù",
    description:
      "Classic mascarpone cream, espresso-soaked savoiardi, cocoa powder",
    price: 2000,
    cost: 580,
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
    cost: 530,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-dessert-panna-cotta",
    name: "Panna Cotta",
    description: "Vanilla bean panna cotta with wild berry coulis",
    price: 1700,
    cost: 400,
    category: "desserts",
    tags: ["vegetarian", "gluten-free"],
    available: true,
    menuRole: "profit-driver",
  },

  // Delivery-exclusive add-ons (audit §3).
  {
    id: "waw-pantry-tiramisu-frozen",
    name: "Frozen Tiramisù Box",
    description:
      "Hand-assembled tiramisù in a take-home tray (~600g). Defrost 4h, serves 4. Delivery only.",
    price: 2800,
    cost: 800,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
    deliveryOnly: true,
  },
  {
    id: "waw-pantry-beer-4pack",
    name: "Peroni Nastro Azzurro 4-Pack",
    description:
      "Four ice-cold Peroni 330ml bottles. Delivery only — driver hands you the carrier.",
    price: 3600,
    cost: 1600,
    category: "drinks",
    tags: [],
    available: true,
    deliveryOnly: true,
  },
  {
    id: "waw-pantry-olive-oil",
    name: "Sud Italia Extra Virgin Olive Oil 250ml",
    description:
      "Single-estate Sicilian EVOO, hand-pressed. Branded bottle. Delivery only.",
    price: 3900,
    cost: 1400,
    category: "antipasti",
    tags: ["vegan", "gluten-free"],
    available: true,
    deliveryOnly: true,
  },
];
