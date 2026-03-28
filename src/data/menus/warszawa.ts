import { MenuItem } from "../types";

export const warszawaMenu: MenuItem[] = [
  // Pizza
  {
    id: "waw-pizza-margherita",
    name: "Margherita",
    description:
      "San Marzano tomato sauce, fior di latte mozzarella, fresh basil, extra virgin olive oil",
    price: 3000,
    cost: 900,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-pizza-diavola",
    name: "Diavola",
    description:
      "San Marzano tomatoes, fior di latte, spicy salame calabrese, chili oil",
    price: 3400,
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
    price: 3700,
    cost: 1330,
    category: "pizza",
    tags: [],
    available: true,
  },
  {
    id: "waw-pizza-quattro-formaggi",
    name: "Quattro Formaggi",
    description:
      "Mozzarella, gorgonzola, fontina, Parmigiano Reggiano, honey drizzle",
    price: 3600,
    cost: 1260,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "waw-pizza-napoli",
    name: "Napoli",
    description:
      "San Marzano tomatoes, mozzarella, anchovies, capers, oregano, olive oil",
    price: 3300,
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
    price: 3800,
    cost: 1370,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },

  // Pasta
  {
    id: "waw-pasta-carbonara",
    name: "Spaghetti Carbonara",
    description:
      "Guanciale, egg yolk, Pecorino Romano, black pepper — the authentic Roman way",
    price: 3100,
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
    price: 2800,
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
    price: 3000,
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
    price: 2900,
    cost: 870,
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
    price: 1800,
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
    price: 2800,
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
    price: 2400,
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
    price: 2600,
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
    price: 2200,
    cost: 660,
    category: "panini",
    tags: ["vegetarian"],
    available: true,
  },

  // Drinks
  {
    id: "waw-drink-limonata",
    name: "Limonata Fresca",
    description: "House-made Sicilian lemonade with fresh mint",
    price: 1400,
    cost: 280,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-aranciata",
    name: "Aranciata San Pellegrino",
    description: "Classic Italian sparkling orange drink",
    price: 1200,
    cost: 360,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-water",
    name: "Acqua Minerale",
    description: "Still or sparkling mineral water (500ml)",
    price: 700,
    cost: 120,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "waw-drink-espresso",
    name: "Espresso",
    description: "Italian-roasted espresso shot",
    price: 900,
    cost: 135,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },

  // Desserts
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
