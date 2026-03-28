import { MenuItem } from "../types";

export const krakowMenu: MenuItem[] = [
  // Pizza
  {
    id: "krk-pizza-margherita",
    name: "Margherita",
    description:
      "San Marzano tomato sauce, fior di latte mozzarella, fresh basil, extra virgin olive oil",
    price: 2800,
    cost: 840,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-pizza-diavola",
    name: "Diavola",
    description:
      "San Marzano tomatoes, fior di latte, spicy salame calabrese, chili oil",
    price: 3200,
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
    price: 3500,
    cost: 1260,
    category: "pizza",
    tags: [],
    available: true,
  },
  {
    id: "krk-pizza-quattro-formaggi",
    name: "Quattro Formaggi",
    description:
      "Mozzarella, gorgonzola, fontina, Parmigiano Reggiano, honey drizzle",
    price: 3400,
    cost: 1190,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-pizza-ortolana",
    name: "Ortolana",
    description:
      "Grilled zucchini, eggplant, bell peppers, cherry tomatoes, mozzarella, basil pesto",
    price: 3100,
    cost: 930,
    category: "pizza",
    tags: ["vegetarian"],
    available: true,
  },

  // Pasta
  {
    id: "krk-pasta-carbonara",
    name: "Spaghetti Carbonara",
    description:
      "Guanciale, egg yolk, Pecorino Romano, black pepper — the authentic Roman way",
    price: 2900,
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
    price: 2400,
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
    price: 2700,
    cost: 810,
    category: "pasta",
    tags: ["vegetarian"],
    available: true,
  },
  {
    id: "krk-pasta-bolognese",
    name: "Tagliatelle Bolognese",
    description:
      "Slow-cooked ragù with beef and pork, San Marzano tomatoes, fresh tagliatelle",
    price: 3000,
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
    price: 1600,
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
    price: 2200,
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
    price: 1800,
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
    price: 2000,
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
    price: 2300,
    cost: 760,
    category: "panini",
    tags: [],
    available: true,
  },

  // Drinks
  {
    id: "krk-drink-limonata",
    name: "Limonata Fresca",
    description: "House-made Sicilian lemonade with fresh mint",
    price: 1200,
    cost: 240,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-aranciata",
    name: "Aranciata San Pellegrino",
    description: "Classic Italian sparkling orange drink",
    price: 1000,
    cost: 300,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-water",
    name: "Acqua Minerale",
    description: "Still or sparkling mineral water (500ml)",
    price: 600,
    cost: 100,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },
  {
    id: "krk-drink-espresso",
    name: "Espresso",
    description: "Italian-roasted espresso shot",
    price: 800,
    cost: 120,
    category: "drinks",
    tags: ["vegan", "gluten-free"],
    available: true,
  },

  // Desserts
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
