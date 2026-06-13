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

import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getSettings, getLoyaltySettings } from "@/lib/store";
import { formatPricePLN } from "@/lib/utils";
import { SITE_NAME } from "@/lib/constants";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Static answers that don't depend on operator config (menu copy, dietary,
// allergen handling, the help fallback). The config-driven answers — hours,
// delivery, locations, loyalty, and the brand name — are built live from the
// store so the bot never quotes a stale price, address or opening time.
// NOTE: server-only now (reads the store). Reach it via /api/chat — never
// import getChatResponse into a client component (Rule #3).
const STATIC_RESPONSES = {
  menu:
    "We serve authentic Neapolitan pizza, fresh pasta, antipasti, panini, drinks, and desserts. Our most popular items are Margherita pizza and Spaghetti Carbonara! Would you like to see the full menu?",
  vegetarian:
    "We have great vegetarian options! Try our Margherita, Quattro Formaggi, Ortolana pizza, Penne Arrabbiata (vegan!), Linguine al Pesto, or our Bruschetta Classica.",
  allergen:
    "For specific allergen information, please ask our staff. We handle dairy, gluten, nuts, and eggs in our kitchen. Gluten-free options are marked on the menu.",
  default:
    "I'd be happy to help! I can answer questions about our menu, locations, hours, delivery, vegetarian options, allergies, and our loyalty program. What would you like to know?",
};

async function brandName(): Promise<string> {
  return (await getSettings()).businessName || SITE_NAME;
}

/** Hours per active location, straight from the admin-managed location records. */
async function hoursAnswer(): Promise<string> {
  const locs = await getActiveLocationsAsync();
  if (locs.length === 0) return "Please check our website for current opening hours.";
  const lines = locs.map((l) => {
    const hrs = l.hours.map((h) => `${h.day} ${h.open}-${h.close}`).join(", ");
    return `- ${l.city}: ${hrs}`;
  });
  return `Our hours vary by location:\n${lines.join("\n")}`;
}

/** Delivery answer from the live `minOrderAmount` + `deliveryFee` settings —
 *  the same numbers checkout enforces, so the bot can't quote a stale gate. */
async function deliveryAnswer(): Promise<string> {
  const s = await getSettings();
  const min = formatPricePLN(s.minOrderAmount);
  const fee = s.deliveryFee > 0 ? formatPricePLN(s.deliveryFee) : "free";
  const freeThreshold = s.deliveryThresholds?.regular;
  const freeLine = freeThreshold && freeThreshold > 0
    ? ` Delivery is free on orders over ${formatPricePLN(freeThreshold)}.`
    : "";
  return `Yes, we offer delivery! You can order through our website. There's a minimum order of ${min}, and the delivery fee is ${fee}.${freeLine}`;
}

/** Locations + addresses from the admin-managed location list. */
async function locationAnswer(): Promise<string> {
  const locs = await getActiveLocationsAsync();
  if (locs.length === 0) return "Please check our website for our current locations.";
  const list = locs.map((l) => `${l.city} (${l.address})`).join(" and ");
  return `We're currently in ${list}.`;
}

/** Loyalty answer from the live tier ladder + brand name. */
async function loyaltyAnswer(): Promise<string> {
  const [loyalty, brand] = await Promise.all([getLoyaltySettings(), brandName()]);
  const t = loyalty.tiers;
  return `Join ${brand} Rewards! Earn 1 point per PLN spent. ${t.bronze.label} starts immediately, and you unlock ${t.silver.label} at ${t.silver.threshold} points with a ${t.silver.multiplier}x multiplier!`;
}

export async function getChatResponse(message: string): Promise<string> {
  const lower = message.toLowerCase();
  if (lower.includes("menu") || lower.includes("food") || lower.includes("eat"))
    return STATIC_RESPONSES.menu;
  if (
    lower.includes("hour") ||
    lower.includes("open") ||
    lower.includes("close") ||
    lower.includes("time")
  )
    return hoursAnswer();
  if (lower.includes("deliver") || lower.includes("shipping"))
    return deliveryAnswer();
  if (
    lower.includes("vegetarian") ||
    lower.includes("vegan") ||
    lower.includes("plant")
  )
    return STATIC_RESPONSES.vegetarian;
  if (
    lower.includes("allergen") ||
    lower.includes("allergy") ||
    lower.includes("gluten") ||
    lower.includes("nut")
  )
    return STATIC_RESPONSES.allergen;
  if (
    lower.includes("where") ||
    lower.includes("location") ||
    lower.includes("address")
  )
    return locationAnswer();
  if (
    lower.includes("loyal") ||
    lower.includes("point") ||
    lower.includes("reward")
  )
    return loyaltyAnswer();
  return STATIC_RESPONSES.default;
}
