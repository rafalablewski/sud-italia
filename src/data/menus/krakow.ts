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
const TARTUFATA_LTO_UNTIL = "2026-08-31";

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
    cost: 820,
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
          { id: "sourdough", label: "48h sourdough", priceDelta: 500, costDelta: 120 },
          { id: "gluten-free", label: "Gluten-free", priceDelta: 500, costDelta: 180, flagOnKds: true },
        ],
      },
      {
        id: "extras",
        label: "Premium toppings",
        minSelections: 0,
        maxSelections: 3,
        options: [
          { id: "buffalo-mozz", label: "Buffalo mozzarella DOP", priceDelta: 900, costDelta: 320, flagOnKds: true },
          { id: "extra-cheese", label: "Extra cheese", priceDelta: 600, costDelta: 200 },
          { id: "truffle-oil", label: "Truffle oil drizzle", priceDelta: 800, costDelta: 220 },
          { id: "prosciutto", label: "Prosciutto di Parma", priceDelta: 1200, costDelta: 480, flagOnKds: true },
        ],
      },
      {
        id: "half-and-half",
        label: "Make it half & half",
        minSelections: 0,
        maxSelections: 1,
        options: [
          { id: "diavola", label: "Half Diavola · spicy salame", priceDelta: 600, costDelta: 220, flagOnKds: true },
          { id: "quattro-formaggi", label: "Half Quattro Formaggi", priceDelta: 500, costDelta: 240, flagOnKds: true },
          { id: "ortolana", label: "Half Ortolana · grilled veg", priceDelta: 400, costDelta: 160, flagOnKds: true },
        ],
      },
    ],
  },
  {
    id: "krk-pizza-quattro-formaggi",
    name: "Quattro Formaggi",
    description:
      "Mozzarella, gorgonzola, fontina, Parmigiano Reggiano, honey drizzle",
    price: 3390,
    cost: 1140,
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
    price: 3290,
    cost: 1010,
    category: "pizza",
    tags: ["spicy"],
    available: true,
    modifierGroups: [
      {
        id: "spice",
        label: "Spice level",
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: "regular", label: "Regular heat", priceDelta: 0 },
          { id: "extra-hot", label: "Extra hot (Calabrian chili)", priceDelta: 200, costDelta: 60, flagOnKds: true },
          { id: "mild", label: "Mild (no chili oil)", priceDelta: 0 },
        ],
      },
      {
        id: "extras",
        label: "Premium toppings",
        minSelections: 0,
        maxSelections: 2,
        options: [
          { id: "extra-salame", label: "Extra spicy salame", priceDelta: 700, costDelta: 250, flagOnKds: true },
          { id: "extra-cheese", label: "Extra cheese", priceDelta: 600, costDelta: 200 },
        ],
      },
    ],
  },
  {
    id: "krk-pizza-prosciutto",
    name: "Prosciutto e Rucola",
    description:
      "Fior di latte, prosciutto crudo di Parma, wild arugula, shaved Parmigiano, olive oil",
    price: 3590,
    cost: 1240,
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
    cost: 880,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-pizza-pizzaiolo",
    name: "Pizza del Pizzaiolo",
    description:
      "Black truffle, buffalo mozzarella DOP, San Marzano tomato whisper, 24-month Parmigiano, olive oil. The Pizzaiolo's signature — limited monthly batch.",
    price: 4990,
    cost: 1660,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
    menuRole: "anchor",
    isLimited: true,
    limitedUntil: PIZZAIOLO_LTO_UNTIL,
  },
  // Tartufata — top-of-range anchor (audit §3.2 menu engineering). Sells
  // ~3%, exists to make the 32–36 PLN range read as a steal. Margin still
  // > 70% on full plate cost because guests who order it skew premium-cocktail.
  {
    id: "krk-pizza-tartufata",
    name: "Tartufata Reale",
    description:
      "Fresh shaved black truffle, 24-month Parmigiano, burrata di Andria, prosciutto di Parma DOP 18-month, San Marzano whisper, truffle oil. The chef's masterpiece — by reservation, very limited.",
    price: 7990,
    cost: 2390,
    category: "pizza",
    tags: [],
    available: true,
    menuRole: "anchor",
    isLimited: true,
    limitedUntil: TARTUFATA_LTO_UNTIL,
  },
  // Personal-size Margherita — entry SKU for late-night slice/solo plays.
  // Same dough as the standard 12", baked smaller (8") with less cheese load.
  {
    id: "krk-pizza-personale",
    name: "Margherita Personale (8\")",
    description:
      "Solo-sized Margherita — same San Marzano, fior di latte, fresh basil. Ready in 6 minutes.",
    price: 1890,
    cost: 540,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  // Slice — late-night / queue-skipper. Pre-cut from a margherita,
  // reheated to order in 60s. Highest-velocity SKU after 21:00.
  {
    id: "krk-pizza-slice",
    name: "Slice (Margherita)",
    description:
      "One slice, reheated to order in 60 seconds. The late-night classic.",
    price: 1190,
    cost: 280,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },

  // Pasta — premium ends in 5 (Carbonara, Bolognese, profit-driver Pesto),
  // standard ends in 9 (Arrabbiata).
  {
    id: "krk-pasta-carbonara",
    name: "Spaghetti Carbonara",
    description:
      "Guanciale, egg yolk, Pecorino Romano, black pepper — the authentic Roman way",
    price: 2895,
    cost: 850,
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
    cost: 590,
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
    cost: 770,
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
    cost: 1090,
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
    cost: 390,
    category: "antipasti",
    tags: ["vegan"],
    available: true,
  },
  // Garlic Bread — pizza-attach play (audit §2). Same dough as the pizzas,
  // baked with garlic butter + parsley + Parmigiano. Cheap to make, near-
  // universal attach to mains. Replaces the panini slot in cross-sell logic.
  {
    id: "krk-anti-garlic-bread",
    name: "Garlic Bread",
    description:
      "Wood-fired pizza dough, garlic butter, fresh parsley, Parmigiano. Pulls apart.",
    price: 990,
    cost: 220,
    category: "antipasti",
    tags: ["vegetarian"],
    available: true,
    menuRole: "profit-driver",
  },
  {
    id: "krk-anti-burrata",
    name: "Burrata con Pomodorini",
    description:
      "Creamy burrata, cherry tomatoes, basil, aged balsamic, olive oil",
    price: 2195,
    cost: 740,
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
    cost: 520,
    category: "antipasti",
    tags: [],
    available: true,
  },

  // Panini — kept for daypart coverage, but no longer the lunch lead.
  // Garlic Bread (above) absorbed the bread-attach role.
  {
    id: "krk-panini-caprese",
    name: "Panino Caprese",
    description:
      "Fresh mozzarella, tomato, basil, olive oil on ciabatta",
    price: 1990,
    cost: 580,
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
    cost: 740,
    category: "panini",
    tags: [],
    available: true,
  },

  // Drinks — espresso ends in 9 (impulse). Espresso is also a profit driver
  // surfaced via the upsell engine, and gets the "Pizzaiolo's Choice" badge.
  // Espresso re-priced to PLN 9.90 (audit §0): the 60%-attach SKU was the
  // single biggest price gap vs Kraków cafés (Tektura, Karma, etc.) at 11–14 PLN.
  {
    id: "krk-drink-espresso",
    name: "Espresso",
    description: "Italian-roasted espresso shot — Caffè Lavazza ¡Tierra! single-origin",
    price: 990,
    cost: 140,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
    menuRole: "profit-driver",
  },
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
  // 1L bottle for sharing — pairs with the Pizza Family Pack fixed bundle.
  {
    id: "krk-drink-limonata-1l",
    name: "Limonata 1L",
    description: "Shareable 1L bottle of house-made Sicilian lemonade",
    price: 1990,
    cost: 380,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-aranciata",
    name: "Aranciata San Pellegrino",
    description: "Classic Italian sparkling orange drink",
    price: 990,
    cost: 320,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-water",
    name: "Acqua Minerale",
    description: "Still or sparkling mineral water (500ml)",
    price: 590,
    cost: 110,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },

  // Desserts — keep ending in 0 (perceived quality).
  // Panna Cotta carries the "value-tier dessert" role — surfaced as default
  // on sub-40 PLN carts; Tiramisù holds the premium / >=40 PLN cart default.
  {
    id: "krk-dessert-tiramisu",
    name: "Tiramisù",
    description:
      "Classic mascarpone cream, espresso-soaked savoiardi, cocoa powder",
    price: 1800,
    cost: 520,
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
    cost: 470,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-dessert-panna-cotta",
    name: "Panna Cotta",
    description: "Vanilla bean panna cotta with wild berry coulis",
    price: 1500,
    cost: 360,
    category: "desserts",
    tags: ["vegetarian", "gluten-free"],
    available: true,
    menuRole: "profit-driver",
  },

  // Delivery-exclusive add-ons (audit §3 — channel economics). High-AOV
  // pantry pulls customers can't carry from a truck. Marked via the
  // deliveryOnly flag so the menu page hides them dine-in.
  {
    id: "krk-pantry-tiramisu-frozen",
    name: "Frozen Tiramisù Box",
    description:
      "Hand-assembled tiramisù in a take-home tray (~600g). Defrost 4h, serves 4. Delivery only.",
    price: 2400,
    cost: 720,
    category: "desserts",
    tags: ["vegetarian"],
    available: true,
    deliveryOnly: true,
  },
  {
    id: "krk-pantry-beer-4pack",
    name: "Peroni Nastro Azzurro 4-Pack",
    description:
      "Four ice-cold Peroni 330ml bottles. Delivery only — driver hands you the carrier.",
    price: 3200,
    cost: 1500,
    category: "drinks",
    tags: [],
    available: true,
    deliveryOnly: true,
  },
  {
    id: "krk-pantry-olive-oil",
    name: "Ottaviano Extra Virgin Olive Oil 250ml",
    description:
      "Single-estate Sicilian EVOO, hand-pressed. Branded bottle. Delivery only.",
    price: 3500,
    cost: 1300,
    category: "antipasti",
    tags: ["vegan", "gluten-free"],
    available: true,
    deliveryOnly: true,
  },
];
