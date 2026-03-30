// AI Engine — Simulated ML models for Sud Italia
// In production, these would call actual ML APIs (e.g., Claude API, custom models)

import { MenuItem, MenuCategory } from "@/data/types";

// --- Demand Forecasting ---

export interface DemandForecast {
  date: string;
  dayOfWeek: string;
  expectedOrders: number;
  confidence: number; // 0-1
  weather: string;
  events: string[];
  categoryBreakdown: Record<MenuCategory, number>;
  recommendation: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEATHER = ["Sunny", "Cloudy", "Rainy", "Snowy", "Partly Cloudy"];

export function generateDemandForecast(days: number = 7): DemandForecast[] {
  const forecasts: DemandForecast[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 5 || dow === 6;
    const weather = WEATHER[Math.floor(Math.random() * WEATHER.length)];
    const badWeather = weather === "Rainy" || weather === "Snowy";

    const baseOrders = isWeekend ? 85 : 52;
    const weatherModifier = badWeather ? 0.75 : weather === "Sunny" ? 1.15 : 1.0;
    const expectedOrders = Math.round(baseOrders * weatherModifier + (Math.random() * 12 - 6));

    const events: string[] = [];
    if (dow === 5) events.push("Friday evening rush");
    if (dow === 6) events.push("Weekend lunch peak");
    if (Math.random() > 0.8) events.push("Local event nearby");

    const categoryBreakdown: Record<MenuCategory, number> = {
      pizza: Math.round(expectedOrders * 0.40),
      pasta: Math.round(expectedOrders * 0.22),
      antipasti: Math.round(expectedOrders * 0.12),
      panini: Math.round(expectedOrders * 0.08),
      drinks: Math.round(expectedOrders * 0.65),
      desserts: Math.round(expectedOrders * 0.18),
    };

    let recommendation = "";
    if (expectedOrders > 75) recommendation = "High demand expected — prep extra dough & schedule additional staff";
    else if (expectedOrders > 55) recommendation = "Moderate demand — standard prep should suffice";
    else if (badWeather) recommendation = "Low demand due to weather — consider running a promotion";
    else recommendation = "Normal weekday — focus on delivery orders";

    forecasts.push({
      date: date.toISOString().split("T")[0],
      dayOfWeek: DAYS[dow],
      expectedOrders,
      confidence: 0.72 + Math.random() * 0.2,
      weather,
      events,
      categoryBreakdown,
      recommendation,
    });
  }

  return forecasts;
}

// --- Dynamic Pricing ---

export interface PriceSuggestion {
  itemId: string;
  itemName: string;
  currentPrice: number;
  suggestedPrice: number;
  reason: string;
  impact: "increase" | "decrease" | "none";
  confidence: number;
  estimatedRevenueChange: number; // in grosze
}

export function generatePriceSuggestions(items: MenuItem[]): PriceSuggestion[] {
  return items.slice(0, 8).map((item) => {
    const margin = item.price > 0 ? (item.price - item.cost) / item.price : 0;
    const random = Math.random();

    let suggestedPrice = item.price;
    let reason = "";
    let impact: "increase" | "decrease" | "none" = "none";

    if (margin < 0.6) {
      // Low margin — suggest increase
      const increase = Math.round(item.price * (0.05 + random * 0.08));
      suggestedPrice = item.price + increase;
      reason = `Low margin (${Math.round(margin * 100)}%). Price increase to improve profitability.`;
      impact = "increase";
    } else if (margin > 0.78) {
      // High margin — could decrease for volume
      const decrease = Math.round(item.price * (0.03 + random * 0.05));
      suggestedPrice = item.price - decrease;
      reason = `High margin (${Math.round(margin * 100)}%). Slight decrease could boost volume by ~12%.`;
      impact = "decrease";
    } else if (random > 0.5) {
      // Demand-based increase
      const increase = Math.round(item.price * 0.03);
      suggestedPrice = item.price + increase;
      reason = "High demand detected during peak hours. Consider peak pricing.";
      impact = "increase";
    } else {
      reason = "Price optimally positioned for current demand.";
    }

    // Round to nearest 100 grosze (1 PLN)
    suggestedPrice = Math.round(suggestedPrice / 100) * 100;

    return {
      itemId: item.id,
      itemName: item.name,
      currentPrice: item.price,
      suggestedPrice,
      reason,
      impact,
      confidence: 0.65 + Math.random() * 0.25,
      estimatedRevenueChange: Math.round((suggestedPrice - item.price) * 30), // assume 30 orders
    };
  });
}

// --- Smart Recommendations Engine ---

export interface RecommendationInsight {
  id: string;
  type: "upsell" | "menu" | "operations" | "marketing";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  estimatedRevenue: string;
}

export function generateInsights(): RecommendationInsight[] {
  return [
    {
      id: "ins-1",
      type: "upsell",
      title: "Bundle Tiramisu with Pizza Orders",
      description: "72% of customers who order Margherita also view Tiramisu. Adding a one-tap \"Add dessert?\" prompt could capture this demand.",
      impact: "high",
      effort: "low",
      estimatedRevenue: "+2,400 PLN/month",
    },
    {
      id: "ins-2",
      type: "menu",
      title: "Remove Acqua Minerale Markup",
      description: "Water has the lowest margin and lowest satisfaction score. Consider offering it free with orders over 40 PLN to boost AOV instead.",
      impact: "medium",
      effort: "low",
      estimatedRevenue: "+1,200 PLN/month",
    },
    {
      id: "ins-3",
      type: "operations",
      title: "Shift Prep to 10:00 on Fridays",
      description: "Peak hour analysis shows Friday orders start 30 min earlier than other days. Starting prep earlier could serve 8 more orders.",
      impact: "high",
      effort: "medium",
      estimatedRevenue: "+3,600 PLN/month",
    },
    {
      id: "ins-4",
      type: "marketing",
      title: "Run Rainy Day Promotion",
      description: "Orders drop 25% on rainy days. A 15% discount code pushed via SMS when rain is forecast could recover 60% of lost orders.",
      impact: "high",
      effort: "medium",
      estimatedRevenue: "+1,800 PLN/month",
    },
    {
      id: "ins-5",
      type: "upsell",
      title: "Introduce \"Family Pack\" Bundle",
      description: "18% of orders contain 3+ pizzas. A family pack (3 pizzas + 3 drinks) at 8% discount would increase order value and simplify ordering.",
      impact: "medium",
      effort: "low",
      estimatedRevenue: "+900 PLN/month",
    },
    {
      id: "ins-6",
      type: "operations",
      title: "Optimize Delivery Radius",
      description: "Deliveries over 3km have 40% longer completion times and lower satisfaction. Tightening the radius and adding a surcharge for far orders would improve NPS.",
      impact: "medium",
      effort: "medium",
      estimatedRevenue: "+600 PLN/month",
    },
    {
      id: "ins-7",
      type: "menu",
      title: "Add Calzone to Menu",
      description: "Search data shows 12% of users search for \"calzone\" with no results. Adding it could capture unmet demand with minimal new ingredients.",
      impact: "high",
      effort: "medium",
      estimatedRevenue: "+2,100 PLN/month",
    },
    {
      id: "ins-8",
      type: "marketing",
      title: "Launch Refer-a-Friend Program",
      description: "Repeat customers have 3x higher AOV. A referral program (give 10 PLN, get 10 PLN) could acquire customers at 1/3 the cost of ads.",
      impact: "high",
      effort: "high",
      estimatedRevenue: "+4,200 PLN/month",
    },
  ];
}

// --- Chatbot Responses ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const CHATBOT_RESPONSES: Record<string, string> = {
  "menu": "We serve authentic Neapolitan pizza, fresh pasta, antipasti, panini, drinks, and desserts. Our most popular items are Margherita pizza and Spaghetti Carbonara! Would you like to see the full menu?",
  "hours": "Our hours vary by location:\n- Kraków: Mon-Thu 11:00-21:00, Fri-Sat 11:00-23:00, Sun 12:00-20:00\n- Warsaw: Mon-Thu 11:00-21:00, Fri-Sat 11:00-22:00, Sun 12:00-20:00",
  "delivery": "Yes, we offer delivery! You can order through our website. There's a minimum order of 30 PLN, and delivery is free for orders over 60 PLN.",
  "vegetarian": "We have great vegetarian options! Try our Margherita, Quattro Formaggi, Ortolana pizza, Penne Arrabbiata (vegan!), Linguine al Pesto, or our Bruschetta Classica.",
  "allergen": "For specific allergen information, please ask our staff at the truck. We handle dairy, gluten, nuts, and eggs in our kitchen. Gluten-free options are marked on the menu.",
  "location": "We're currently in Kraków (Rynek Główny) and Warsaw (ul. Nowy Świat 15). Wrocław is coming soon!",
  "loyalty": "Join our Sud Italia Rewards program! Earn 1 point per PLN spent. Bronze tier starts immediately, and you unlock Silver at 500 points with a 1.5x multiplier!",
  "default": "I'd be happy to help! I can answer questions about our menu, locations, hours, delivery, vegetarian options, allergies, and our loyalty program. What would you like to know?",
};

export function getChatResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("menu") || lower.includes("food") || lower.includes("eat")) return CHATBOT_RESPONSES.menu;
  if (lower.includes("hour") || lower.includes("open") || lower.includes("close") || lower.includes("time")) return CHATBOT_RESPONSES.hours;
  if (lower.includes("deliver") || lower.includes("shipping")) return CHATBOT_RESPONSES.delivery;
  if (lower.includes("vegetarian") || lower.includes("vegan") || lower.includes("plant")) return CHATBOT_RESPONSES.vegetarian;
  if (lower.includes("allergen") || lower.includes("allergy") || lower.includes("gluten") || lower.includes("nut")) return CHATBOT_RESPONSES.allergen;
  if (lower.includes("where") || lower.includes("location") || lower.includes("address")) return CHATBOT_RESPONSES.location;
  if (lower.includes("loyal") || lower.includes("point") || lower.includes("reward")) return CHATBOT_RESPONSES.loyalty;

  return CHATBOT_RESPONSES.default;
}
