// Customer-side chat FAQ matcher.
//
// Despite the legacy filename, this is NOT an AI engine. It is a
// keyword-rule lookup that returns a canned answer to common customer
// questions in the floating ChatWidget. We keep the file at its
// historical path so existing imports in <ChatWidget /> continue to work
// without a churn-only rename.
//
// The actual AI-backed surfaces in the codebase live elsewhere:
//   - src/lib/ai/forecast.ts    (Claude-backed demand forecasting)
//   - src/lib/ai/gateway.ts     (Anthropic client + budget gate)
//   - src/lib/ai/tools/         (Ops Agent tool registry)
//
// Previous revisions of this file exported heuristic `generateDemandForecast`,
// `generatePriceSuggestions`, and `generateInsights` that were random-number
// generators dressed as ML. They had no callers and were deleted (2026-05-21)
// to keep the audit ledger honest — see docs/audits/2026-05-nyc-singapore-viability-audit.md
// §10.3 ("Unnecessary Complexity To Cut").

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const CHATBOT_RESPONSES: Record<string, string> = {
  menu:
    "We serve authentic Neapolitan pizza, fresh pasta, antipasti, panini, drinks, and desserts. Our most popular items are Margherita pizza and Spaghetti Carbonara! Would you like to see the full menu?",
  hours:
    "Our hours vary by location:\n- Kraków: Mon-Thu 11:00-21:00, Fri-Sat 11:00-23:00, Sun 12:00-20:00\n- Warsaw: Mon-Thu 11:00-21:00, Fri-Sat 11:00-22:00, Sun 12:00-20:00",
  delivery:
    "Yes, we offer delivery! You can order through our website. There's a minimum order of 30 PLN, and delivery is free for orders over 60 PLN.",
  vegetarian:
    "We have great vegetarian options! Try our Margherita, Quattro Formaggi, Ortolana pizza, Penne Arrabbiata (vegan!), Linguine al Pesto, or our Bruschetta Classica.",
  allergen:
    "For specific allergen information, please ask our staff at the truck. We handle dairy, gluten, nuts, and eggs in our kitchen. Gluten-free options are marked on the menu.",
  location:
    "We're currently in Kraków (Rynek Główny) and Warsaw (ul. Nowy Świat 15). Wrocław is coming soon!",
  loyalty:
    "Join our Sud Italia Rewards program! Earn 1 point per PLN spent. Bronze tier starts immediately, and you unlock Silver at 500 points with a 1.5x multiplier!",
  default:
    "I'd be happy to help! I can answer questions about our menu, locations, hours, delivery, vegetarian options, allergies, and our loyalty program. What would you like to know?",
};

export function getChatResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("menu") || lower.includes("food") || lower.includes("eat"))
    return CHATBOT_RESPONSES.menu;
  if (
    lower.includes("hour") ||
    lower.includes("open") ||
    lower.includes("close") ||
    lower.includes("time")
  )
    return CHATBOT_RESPONSES.hours;
  if (lower.includes("deliver") || lower.includes("shipping"))
    return CHATBOT_RESPONSES.delivery;
  if (
    lower.includes("vegetarian") ||
    lower.includes("vegan") ||
    lower.includes("plant")
  )
    return CHATBOT_RESPONSES.vegetarian;
  if (
    lower.includes("allergen") ||
    lower.includes("allergy") ||
    lower.includes("gluten") ||
    lower.includes("nut")
  )
    return CHATBOT_RESPONSES.allergen;
  if (
    lower.includes("where") ||
    lower.includes("location") ||
    lower.includes("address")
  )
    return CHATBOT_RESPONSES.location;
  if (
    lower.includes("loyal") ||
    lower.includes("point") ||
    lower.includes("reward")
  )
    return CHATBOT_RESPONSES.loyalty;
  return CHATBOT_RESPONSES.default;
}
